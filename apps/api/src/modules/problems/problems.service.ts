import crypto from 'crypto';
import { memoryDb, query } from '../../config/db.js';
import { minioService } from '../../config/minio.js';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import {
  CreateProblemInput,
  UpdateProblemInput,
  QueryProblemsInput,
  Problem,
  ProblemDifficulty,
  REDIS_KEYS,
  ERROR_CODES,
} from '@judge/shared';
import { AppError } from '../../utils/app-error.js';
import { ProblemRow, TestCaseRow } from '../../../../drizzle/schema.js';

export class ProblemsService {
  async createProblem(setterId: string, input: CreateProblemInput): Promise<Problem> {
    const id = crypto.randomUUID();
    const slug = input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + id.substring(0, 6);

    const problemRow: ProblemRow = {
      id,
      title: input.title,
      slug,
      statement: input.statement,
      difficulty: input.difficulty,
      tags: input.tags,
      time_limit_ms: input.timeLimitMs,
      memory_limit_mb: input.memoryLimitMb,
      sample_input: input.sampleInput,
      sample_expected_output: input.sampleExpectedOutput,
      setter_id: setterId,
      is_archived: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    memoryDb.problems.set(id, problemRow);

    // Save test cases into MinIO; store only keys in database (AC-PR-01)
    if (input.testCases && input.testCases.length > 0) {
      for (let i = 0; i < input.testCases.length; i++) {
        const tc = input.testCases[i];
        const inputKey = `problems/${id}/test_${i}_in.txt`;
        const outputKey = `problems/${id}/test_${i}_out.txt`;

        await minioService.putObject(inputKey, tc.input);
        await minioService.putObject(outputKey, tc.expectedOutput);

        const testCaseRow: TestCaseRow = {
          id: crypto.randomUUID(),
          problem_id: id,
          index: i,
          input_key: inputKey,
          expected_output_key: outputKey,
          is_hidden: tc.isHidden ?? true,
          created_at: new Date(),
        };

        memoryDb.testCases.set(testCaseRow.id, testCaseRow);
      }
    }

    return this.mapToDto(problemRow);
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

    // 2. Query database
    const problem = Array.from(memoryDb.problems.values()).find(
      (p) => (p.id === idOrSlug || p.slug === idOrSlug) && !p.is_archived
    );

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
    const problem = memoryDb.problems.get(id);
    if (!problem || problem.is_archived) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    if (input.title) problem.title = input.title;
    if (input.statement) problem.statement = input.statement;
    if (input.difficulty) problem.difficulty = input.difficulty;
    if (input.tags) problem.tags = input.tags;
    if (input.timeLimitMs) problem.time_limit_ms = input.timeLimitMs;
    if (input.memoryLimitMb) problem.memory_limit_mb = input.memoryLimitMb;
    if (input.sampleInput !== undefined) problem.sample_input = input.sampleInput;
    if (input.sampleExpectedOutput !== undefined) problem.sample_expected_output = input.sampleExpectedOutput;
    problem.updated_at = new Date();

    // Invalidate Redis cache (AC-PR-05 / Card 8)
    if (isRedisHealthy()) {
      try {
        await redisClient.del(REDIS_KEYS.PROBLEM_CACHE(id));
        await redisClient.del(REDIS_KEYS.PROBLEM_CACHE(problem.slug));
      } catch {}
    }

    return this.mapToDto(problem);
  }

  /**
   * Search and filter problems with cursor pagination (AC-PR-03, AC-PR-04)
   */
  async listProblems(params: QueryProblemsInput): Promise<{ items: Problem[]; nextCursor: string | null }> {
    let items = Array.from(memoryDb.problems.values()).filter((p) => !p.is_archived);

    // Filter by difficulty (AND condition)
    if (params.difficulty) {
      items = items.filter((p) => p.difficulty === params.difficulty);
    }

    // Filter by tag (AND condition)
    if (params.tag) {
      items = items.filter((p) => p.tags.includes(params.tag!));
    }

    // Search query with ranking (title match ranked higher than statement match)
    if (params.search && params.search.trim().length > 0) {
      const q = params.search.trim().toLowerCase();
      items = items
        .filter((p) => p.title.toLowerCase().includes(q) || p.statement.toLowerCase().includes(q))
        .sort((a, b) => {
          const aTitle = a.title.toLowerCase().includes(q) ? 2 : 0;
          const bTitle = b.title.toLowerCase().includes(q) ? 2 : 0;
          return bTitle - aTitle;
        });
    } else {
      // Default order: newest first
      items.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    }

    // Cursor pagination by stable item ID (AC-PR-04)
    if (params.cursor) {
      const cursorIndex = items.findIndex((p) => p.id === params.cursor);
      if (cursorIndex !== -1) {
        items = items.slice(cursorIndex + 1);
      }
    }

    const limit = params.limit || 20;
    const paginated = items.slice(0, limit);
    const lastItem = paginated[paginated.length - 1];
    const nextCursor = items.length > limit && lastItem ? lastItem.id : null;

    return {
      items: paginated.map((p) => this.mapToDto(p)),
      nextCursor,
    };
  }

  private mapToDto(p: ProblemRow): Problem {
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      statement: p.statement,
      difficulty: p.difficulty as ProblemDifficulty,
      tags: p.tags,
      timeLimitMs: p.time_limit_ms,
      memoryLimitMb: p.memory_limit_mb,
      sampleInput: p.sample_input,
      sampleExpectedOutput: p.sample_expected_output,
      setterId: p.setter_id,
      isArchived: p.is_archived,
      createdAt: p.created_at.toISOString(),
      updatedAt: p.updated_at.toISOString(),
    };
  }
}

export const problemsService = new ProblemsService();
