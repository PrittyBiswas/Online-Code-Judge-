import crypto from 'crypto';
import { and, arrayContains, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  UpdateProblemInput,
  Problem,
  ProblemDifficulty,
  REDIS_KEYS,
  ERROR_CODES,
  createProblemSchema,
  queryProblemsSchema,
} from '@judge/shared';
import { db } from '../../db/index.js';
import { problems, testCases, type ProblemRecord } from '../../db/schema.js';
import { minioService } from '../../config/minio.js';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';

type CreateProblemParams = z.input<typeof createProblemSchema>;
type QueryProblemsParams = z.input<typeof queryProblemsSchema>;

export class ProblemsService {
  async createProblem(setterId: string, rawInput: CreateProblemParams): Promise<Problem> {
    if (!isUuid(setterId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid setter user reference', 400);
    }

    const input = createProblemSchema.parse(rawInput);
    const id = crypto.randomUUID();
    const baseSlug = input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug || 'problem'}-${id.substring(0, 6)}`;

    // Upload test case payloads to MinIO first so DB stores only object keys (AC-PR-01)
    const testCaseRecords: Array<{
      id: string;
      problemId: string;
      index: number;
      inputKey: string;
      expectedOutputKey: string;
      isHidden: boolean;
    }> = [];

    if (input.testCases && input.testCases.length > 0) {
      for (let i = 0; i < input.testCases.length; i++) {
        const tc = input.testCases[i];
        const inputKey = `problems/${id}/test_${i}_in.txt`;
        const outputKey = `problems/${id}/test_${i}_out.txt`;

        await minioService.putObject(inputKey, tc.input);
        await minioService.putObject(outputKey, tc.expectedOutput);

        testCaseRecords.push({
          id: crypto.randomUUID(),
          problemId: id,
          index: i,
          inputKey,
          expectedOutputKey: outputKey,
          isHidden: tc.isHidden ?? true,
        });
      }
    }

    try {
      const created = await db.transaction(async (tx) => {
        const [insertedProblem] = await tx
          .insert(problems)
          .values({
            id,
            title: input.title,
            slug,
            statement: input.statement,
            difficulty: input.difficulty,
            tags: input.tags,
            timeLimitMs: input.timeLimitMs,
            memoryLimitMb: input.memoryLimitMb,
            sampleInput: input.sampleInput,
            sampleExpectedOutput: input.sampleExpectedOutput,
            setterId,
            isArchived: false,
          })
          .returning();

        if (testCaseRecords.length > 0) {
          await tx.insert(testCases).values(testCaseRecords);
        }

        return insertedProblem;
      });

      return this.mapToDto(created);
    } catch (err) {
      throw mapDatabaseError(err, {
        uniqueViolation: 'A problem with this slug already exists',
        foreignKeyViolation: 'Problem setter user does not exist',
      });
    }
  }

  async getProblem(idOrSlug: string): Promise<Problem> {
    const cacheKey = REDIS_KEYS.PROBLEM_CACHE(idOrSlug);

    // 1. Try cache-aside read (Card 8)
    if (isRedisHealthy()) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch {}
    }

    // 2. Query PostgreSQL
    let problem: ProblemRecord | undefined;
    try {
      const lookupFilter = isUuid(idOrSlug)
        ? or(eq(problems.id, idOrSlug), eq(problems.slug, idOrSlug))
        : eq(problems.slug, idOrSlug);

      const rows = await db
        .select()
        .from(problems)
        .where(and(lookupFilter, eq(problems.isArchived, false)))
        .limit(1);
      problem = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!problem) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    // AC-PR-02: Hidden tests never appear in problem API response
    const dto = this.mapToDto(problem);

    // 3. Fill cache with TTL (300 seconds)
    if (isRedisHealthy()) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(dto), 'EX', 300);
      } catch {}
    }

    return dto;
  }

  async updateProblem(id: string, input: UpdateProblemInput): Promise<Problem> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    const patch: Partial<typeof problems.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.statement !== undefined) patch.statement = input.statement;
    if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.timeLimitMs !== undefined) patch.timeLimitMs = input.timeLimitMs;
    if (input.memoryLimitMb !== undefined) patch.memoryLimitMb = input.memoryLimitMb;
    if (input.sampleInput !== undefined) patch.sampleInput = input.sampleInput;
    if (input.sampleExpectedOutput !== undefined) {
      patch.sampleExpectedOutput = input.sampleExpectedOutput;
    }

    let updated: ProblemRecord | undefined;
    try {
      const rows = await db
        .update(problems)
        .set(patch)
        .where(and(eq(problems.id, id), eq(problems.isArchived, false)))
        .returning();
      updated = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!updated) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    // Invalidate Redis cache (AC-PR-05 / Card 8)
    if (isRedisHealthy()) {
      try {
        await redisClient.del(REDIS_KEYS.PROBLEM_CACHE(id));
        await redisClient.del(REDIS_KEYS.PROBLEM_CACHE(updated.slug));
      } catch {}
    }

    return this.mapToDto(updated);
  }

  async deleteProblem(id: string): Promise<void> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    let deleted: { id: string; slug: string } | undefined;
    try {
      const rows = await db
        .delete(problems)
        .where(eq(problems.id, id))
        .returning({ id: problems.id, slug: problems.slug });
      deleted = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!deleted) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    if (isRedisHealthy()) {
      try {
        await redisClient.del(REDIS_KEYS.PROBLEM_CACHE(id));
        await redisClient.del(REDIS_KEYS.PROBLEM_CACHE(deleted.slug));
      } catch {}
    }
  }

  /**
   * Search and filter problems with cursor pagination (AC-PR-03, AC-PR-04)
   */
  async listProblems(
    rawParams: QueryProblemsParams
  ): Promise<{ items: Problem[]; nextCursor: string | null }> {
    const params = queryProblemsSchema.parse(rawParams);
    const limit = params.limit || 20;
    const conditions: SQL[] = [eq(problems.isArchived, false)];

    if (params.difficulty) {
      conditions.push(eq(problems.difficulty, params.difficulty));
    }

    if (params.tag) {
      conditions.push(arrayContains(problems.tags, [params.tag]));
    }

    const searchText = params.search?.trim();
    if (searchText) {
      const pattern = `%${searchText}%`;
      const searchCond = or(ilike(problems.title, pattern), ilike(problems.statement, pattern));
      if (searchCond) conditions.push(searchCond);
    }

    try {
      if (params.cursor && isUuid(params.cursor) && !searchText) {
        const [cursorRow] = await db
          .select({ createdAt: problems.createdAt, id: problems.id })
          .from(problems)
          .where(eq(problems.id, params.cursor))
          .limit(1);

        if (cursorRow) {
          const cursorCond = or(
            lt(problems.createdAt, cursorRow.createdAt),
            and(eq(problems.createdAt, cursorRow.createdAt), lt(problems.id, cursorRow.id))
          );
          if (cursorCond) conditions.push(cursorCond);
        }
      }

      if (searchText) {
        const pattern = `%${searchText}%`;
        const allMatches = await db
          .select()
          .from(problems)
          .where(and(...conditions))
          .orderBy(
            desc(sql`CASE WHEN ${problems.title} ILIKE ${pattern} THEN 1 ELSE 0 END`),
            desc(problems.createdAt),
            desc(problems.id)
          );

        let filtered = allMatches;
        if (params.cursor) {
          const cursorIdx = filtered.findIndex((p) => p.id === params.cursor);
          if (cursorIdx !== -1) {
            filtered = filtered.slice(cursorIdx + 1);
          }
        }

        const page = filtered.slice(0, limit);
        const lastItem = page[page.length - 1];
        const nextCursor = filtered.length > limit && lastItem ? lastItem.id : null;
        return {
          items: page.map((p) => this.mapToDto(p)),
          nextCursor,
        };
      }

      const rows = await db
        .select()
        .from(problems)
        .where(and(...conditions))
        .orderBy(desc(problems.createdAt), desc(problems.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const lastItem = page[page.length - 1];

      return {
        items: page.map((p) => this.mapToDto(p)),
        nextCursor: hasMore && lastItem ? lastItem.id : null,
      };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  private mapToDto(p: ProblemRecord): Problem {
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      statement: p.statement,
      difficulty: p.difficulty as ProblemDifficulty,
      tags: p.tags,
      timeLimitMs: p.timeLimitMs,
      memoryLimitMb: p.memoryLimitMb,
      sampleInput: p.sampleInput,
      sampleExpectedOutput: p.sampleExpectedOutput,
      setterId: p.setterId,
      isArchived: p.isArchived,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}

export const problemsService = new ProblemsService();
