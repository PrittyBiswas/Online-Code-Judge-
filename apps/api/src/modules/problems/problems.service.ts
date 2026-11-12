import crypto from 'crypto';
import { and, arrayContains, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  UpdateProblemInput,
  Problem,
  ProblemDifficulty,
  REDIS_KEYS,
  ERROR_CODES,
  createProblemSchema,
  queryProblemsSchema,
  updateProblemSchema,
} from '@judge/shared';
import { db } from '../../db/index.js';
import { problems, submissions, testCases, type ProblemRecord } from '../../db/schema.js';
import { minioService } from '../../config/minio.js';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';
import { logger } from '../../utils/logger.js';

type CreateProblemParams = z.input<typeof createProblemSchema>;
type QueryProblemsParams = z.input<typeof queryProblemsSchema>;

const PROBLEM_DETAIL_TTL_SECONDS = 300;
const PROBLEM_LIST_TTL_SECONDS = 120;

const cursorPayloadSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  rank: z.number().finite().optional(),
});

type CursorPayload = z.infer<typeof cursorPayloadSchema>;

function encodeProblemCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeProblemCursor(rawCursor: string, hasSearch: boolean): CursorPayload {
  let parsedJson: unknown;
  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    parsedJson = JSON.parse(decoded);
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid pagination cursor', 400);
  }

  const parsed = cursorPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid pagination cursor', 400);
  }

  if (hasSearch && parsed.data.rank === undefined) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid search pagination cursor', 400);
  }

  return parsed.data;
}

export interface DeleteProblemResult {
  deleted: boolean;
  archived: boolean;
  id: string;
}

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

    // Upload test-case payloads to MinIO/Silo first; track keys for compensation if DB fails.
    const uploadedKeys: string[] = [];
    const testCaseRecords: Array<{
      id: string;
      problemId: string;
      index: number;
      inputKey: string;
      expectedOutputKey: string;
      isHidden: boolean;
    }> = [];

    try {
      if (input.testCases && input.testCases.length > 0) {
        for (let i = 0; i < input.testCases.length; i++) {
          const tc = input.testCases[i];
          const inputKey = `problems/${id}/test_${i}_in.txt`;
          const outputKey = `problems/${id}/test_${i}_out.txt`;

          await minioService.putObject(inputKey, tc.input);
          uploadedKeys.push(inputKey);
          await minioService.putObject(outputKey, tc.expectedOutput);
          uploadedKeys.push(outputKey);

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

      await this.invalidateListCache();
      return this.mapToDto(created);
    } catch (err) {
      if (uploadedKeys.length > 0) {
        await minioService.deleteObjects(uploadedKeys);
      }
      throw mapDatabaseError(err, {
        uniqueViolation: 'A problem with this slug already exists',
        foreignKeyViolation: 'Problem setter user does not exist',
      });
    }
  }

  async getProblem(idOrSlug: string): Promise<Problem> {
    const cacheKey = REDIS_KEYS.PROBLEM_CACHE(idOrSlug);

    // 1. Cache-aside read (Redis)
    if (isRedisHealthy()) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<Problem>;
          if (parsed && typeof parsed.id === 'string' && typeof parsed.title === 'string') {
            return parsed as Problem;
          }
          await redisClient.del(cacheKey);
        }
      } catch (err) {
        logger.warn(
          { cacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem detail cache read failed; falling back to PostgreSQL'
        );
        await this.safeDeleteKey(cacheKey);
      }
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

    // Hidden tests, MinIO keys, and credentials never appear in problem API responses.
    const dto = this.mapToDto(problem);

    // 3. Populate cache with TTL
    if (isRedisHealthy()) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(dto), 'EX', PROBLEM_DETAIL_TTL_SECONDS);
      } catch (err) {
        logger.warn(
          { cacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem detail cache write failed'
        );
      }
    }

    return dto;
  }

  async updateProblem(id: string, rawInput: UpdateProblemInput): Promise<Problem> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    const input = updateProblemSchema.parse(rawInput);

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

    await this.invalidateProblemCaches(id, updated.slug);
    return this.mapToDto(updated);
  }

  async deleteProblem(id: string): Promise<DeleteProblemResult> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    let outcome: { slug: string; archived: boolean; keysToDelete: string[] } | undefined;

    try {
      outcome = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: problems.id, slug: problems.slug, isArchived: problems.isArchived })
          .from(problems)
          .where(eq(problems.id, id))
          .limit(1);

        if (!existing || existing.isArchived) {
          return undefined;
        }

        const existingSub = await tx
          .select({ id: submissions.id })
          .from(submissions)
          .where(eq(submissions.problemId, id))
          .limit(1);

        if (existingSub.length > 0) {
          // Safe archival strategy when submissions reference this problem:
          // preserve submission history and MinIO test-case objects.
          await tx
            .update(problems)
            .set({ isArchived: true, updatedAt: new Date() })
            .where(eq(problems.id, id));
          return { slug: existing.slug, archived: true, keysToDelete: [] };
        }

        const tcRows = await tx
          .select({
            inputKey: testCases.inputKey,
            expectedOutputKey: testCases.expectedOutputKey,
          })
          .from(testCases)
          .where(eq(testCases.problemId, id));

        const keysToDelete = tcRows.flatMap((tc) => [tc.inputKey, tc.expectedOutputKey]);

        await tx.delete(problems).where(eq(problems.id, id));
        return { slug: existing.slug, archived: false, keysToDelete };
      });
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!outcome) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    // Delete MinIO objects only after confirming DB deletion (and never when archived)
    if (!outcome.archived && outcome.keysToDelete.length > 0) {
      await minioService.deleteObjects(outcome.keysToDelete);
    }

    await this.invalidateProblemCaches(id, outcome.slug);

    return {
      deleted: true,
      archived: outcome.archived,
      id,
    };
  }

  /**
   * Search and filter problems using PostgreSQL full-text search, AND-combined filters,
   * base64url keyset cursor pagination, and versioned Redis cache-aside.
   */
  async listProblems(
    rawParams: QueryProblemsParams
  ): Promise<{ items: Problem[]; nextCursor: string | null }> {
    const params = queryProblemsSchema.parse(rawParams);
    const limit = params.limit || 20;
    const searchText = params.search?.trim() || '';
    const hasSearch = searchText.length > 0;

    const cursorPayload = params.cursor ? decodeProblemCursor(params.cursor, hasSearch) : null;

    // 1. Try versioned Redis list cache
    const listCacheKey = await this.buildListCacheKey({
      search: searchText,
      difficulty: params.difficulty,
      tag: params.tag,
      category: params.category,
      cursor: params.cursor,
      limit,
    });

    if (listCacheKey && isRedisHealthy()) {
      try {
        const cached = await redisClient.get(listCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { items?: unknown; nextCursor?: unknown };
          if (
            parsed &&
            Array.isArray(parsed.items) &&
            (parsed.nextCursor === null || typeof parsed.nextCursor === 'string')
          ) {
            return {
              items: parsed.items as Problem[],
              nextCursor: parsed.nextCursor,
            };
          }
          await this.safeDeleteKey(listCacheKey);
        }
      } catch (err) {
        logger.warn(
          { listCacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem list cache read failed; falling back to PostgreSQL'
        );
        await this.safeDeleteKey(listCacheKey);
      }
    }

    // 2. Build parameterized PostgreSQL WHERE conditions (strict AND semantics)
    const conditions: SQL[] = [eq(problems.isArchived, false)];

    if (params.difficulty) {
      conditions.push(eq(problems.difficulty, params.difficulty));
    }

    if (params.tag) {
      conditions.push(arrayContains(problems.tags, [params.tag]));
    }

    if (params.category) {
      conditions.push(arrayContains(problems.tags, [params.category]));
    }

    const tsvectorExpr = sql`to_tsvector('english', coalesce(${problems.title}, '') || ' ' || coalesce(${problems.statement}, ''))`;
    const tsqueryExpr = hasSearch ? sql`websearch_to_tsquery('english', ${searchText})` : null;
    const rankExpr = tsqueryExpr
      ? sql<number>`ts_rank(${tsvectorExpr}, ${tsqueryExpr})::float8`
      : null;

    if (tsqueryExpr) {
      conditions.push(sql`${tsvectorExpr} @@ ${tsqueryExpr}`);
    }

    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.createdAt);
      if (hasSearch && rankExpr && cursorPayload.rank !== undefined) {
        const cursorRank = cursorPayload.rank;
        const keysetCond = or(
          sql`${rankExpr} < ${cursorRank}`,
          and(sql`${rankExpr} = ${cursorRank}`, lt(problems.createdAt, cursorDate)),
          and(
            sql`${rankExpr} = ${cursorRank}`,
            eq(problems.createdAt, cursorDate),
            lt(problems.id, cursorPayload.id)
          )
        );
        if (keysetCond) conditions.push(keysetCond);
      } else {
        const keysetCond = or(
          lt(problems.createdAt, cursorDate),
          and(eq(problems.createdAt, cursorDate), lt(problems.id, cursorPayload.id))
        );
        if (keysetCond) conditions.push(keysetCond);
      }
    }

    let result: { items: Problem[]; nextCursor: string | null };

    try {
      if (hasSearch && rankExpr) {
        const rows = await db
          .select({
            problem: problems,
            rank: rankExpr,
          })
          .from(problems)
          .where(and(...conditions))
          .orderBy(desc(rankExpr), desc(problems.createdAt), desc(problems.id))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const lastEntry = page[page.length - 1];

        result = {
          items: page.map((entry) => this.mapToDto(entry.problem)),
          nextCursor:
            hasMore && lastEntry
              ? encodeProblemCursor({
                  id: lastEntry.problem.id,
                  createdAt: lastEntry.problem.createdAt.toISOString(),
                  rank: Number(lastEntry.rank),
                })
              : null,
        };
      } else {
        const rows = await db
          .select()
          .from(problems)
          .where(and(...conditions))
          .orderBy(desc(problems.createdAt), desc(problems.id))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const lastItem = page[page.length - 1];

        result = {
          items: page.map((p) => this.mapToDto(p)),
          nextCursor:
            hasMore && lastItem
              ? encodeProblemCursor({
                  id: lastItem.id,
                  createdAt: lastItem.createdAt.toISOString(),
                })
              : null,
        };
      }
    } catch (err) {
      throw mapDatabaseError(err);
    }

    // 3. Populate list cache with TTL
    if (listCacheKey && isRedisHealthy()) {
      try {
        await redisClient.set(listCacheKey, JSON.stringify(result), 'EX', PROBLEM_LIST_TTL_SECONDS);
      } catch (err) {
        logger.warn(
          { listCacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem list cache write failed'
        );
      }
    }

    return result;
  }

  private async getListCacheVersion(): Promise<string> {
    if (!isRedisHealthy()) return '1';
    try {
      const version = await redisClient.get(REDIS_KEYS.PROBLEMS_LIST_VERSION);
      return version || '1';
    } catch {
      return '1';
    }
  }

  private async buildListCacheKey(
    normalizedParams: Record<string, unknown>
  ): Promise<string | null> {
    if (!isRedisHealthy()) return null;
    const version = await this.getListCacheVersion();
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(normalizedParams))
      .digest('hex')
      .slice(0, 24);
    return REDIS_KEYS.PROBLEMS_LIST_CACHE(version, hash);
  }

  private async invalidateListCache(): Promise<void> {
    if (!isRedisHealthy()) return;
    try {
      await redisClient.incr(REDIS_KEYS.PROBLEMS_LIST_VERSION);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : 'unknown' },
        'Failed to increment Redis problem list cache version'
      );
    }
  }

  private async invalidateProblemCaches(id: string, slug: string): Promise<void> {
    if (!isRedisHealthy()) return;
    await Promise.all([
      this.safeDeleteKey(REDIS_KEYS.PROBLEM_CACHE(id)),
      this.safeDeleteKey(REDIS_KEYS.PROBLEM_CACHE(slug)),
      this.invalidateListCache(),
    ]);
  }

  private async safeDeleteKey(key: string): Promise<void> {
    if (!isRedisHealthy()) return;
    try {
      await redisClient.del(key);
    } catch {}
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
