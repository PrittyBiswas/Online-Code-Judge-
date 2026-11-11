import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { SubmissionStatus, ProblemDifficulty } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { problems, submissions } from '../src/db/schema.js';

const TEST_SETTER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_USER_ID = '22222222-2222-4222-8222-222222222222';

function mapProblem(p: any) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    statement: p.statement,
    difficulty: p.difficulty,
    tags: p.tags,
    timeLimitMs: p.time_limit_ms,
    memoryLimitMb: p.memory_limit_mb,
    sampleInput: p.sample_input,
    sampleExpectedOutput: p.sample_expected_output,
    setterId: p.setter_id,
    isArchived: p.is_archived,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function mapSubmission(s: any) {
  return {
    id: s.id,
    problemId: s.problem_id,
    userId: s.user_id,
    code: s.code,
    language: s.language,
    status: s.status,
    verdict: s.verdict,
    executionTimeMs: s.execution_time_ms,
    memoryUsedKb: s.memory_used_kb,
    failedTestIndex: s.failed_test_index,
    retryCount: s.retry_count,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

vi.mock('../src/db/index.js', () => {
  const buildTx = () => ({
    insert: (table: unknown) => ({
      values: (vals: any) => {
        if (table === problems) {
          const now = new Date();
          const row = {
            id: vals.id,
            title: vals.title,
            slug: vals.slug,
            statement: vals.statement,
            difficulty: vals.difficulty,
            tags: vals.tags || [],
            time_limit_ms: vals.timeLimitMs ?? 2000,
            memory_limit_mb: vals.memoryLimitMb ?? 128,
            sample_input: vals.sampleInput ?? '',
            sample_expected_output: vals.sampleExpectedOutput ?? '',
            setter_id: vals.setterId,
            is_archived: false,
            created_at: now,
            updated_at: now,
          };
          memoryDb.problems.set(row.id, row);
          return { returning: async () => [mapProblem(row)] };
        }
        return Promise.resolve();
      },
    }),
  });

  return {
    db: {
      transaction: async (fn: (tx: ReturnType<typeof buildTx>) => Promise<any>) => fn(buildTx()),
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table === problems) {
                return Array.from(memoryDb.problems.values()).map(mapProblem);
              }
              return Array.from(memoryDb.submissions.values()).map(mapSubmission);
            },
            orderBy: () => ({
              limit: async (n: number) =>
                Array.from(memoryDb.submissions.values())
                  .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
                  .slice(0, n)
                  .map(mapSubmission),
            }),
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: (vals: any) => ({
          returning: async () => {
            if (table === submissions) {
              const id = crypto.randomUUID();
              const now = new Date();
              const row = {
                id,
                problem_id: vals.problemId,
                user_id: vals.userId,
                code: vals.code,
                language: vals.language,
                status: vals.status,
                verdict: null,
                execution_time_ms: null,
                memory_used_kb: null,
                failed_test_index: null,
                retry_count: vals.retryCount ?? 0,
                created_at: now,
                updated_at: now,
              };
              memoryDb.submissions.set(id, row);
              return [mapSubmission(row)];
            }
            return [];
          },
        }),
      }),
    },
    pool: { query: vi.fn(), end: vi.fn() },
    checkDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

import { submissionsService } from '../src/modules/submissions/submissions.service.js';
import { problemsService } from '../src/modules/problems/problems.service.js';

describe('Submissions Service (AC-SJ-01, AC-SJ-10, AC-SJ-11, AC-FE-04)', () => {
  let problemId: string;

  beforeEach(async () => {
    memoryDb.problems.clear();
    memoryDb.submissions.clear();

    const p = await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Simple Echo',
      statement: 'Print the input.',
      difficulty: ProblemDifficulty.EASY,
      tags: [],
      timeLimitMs: 1500,
      memoryLimitMb: 64,
      sampleInput: 'Hello 42',
      sampleExpectedOutput: 'Hello 42',
    });
    problemId = p.id;
  });

  it('AC-SJ-01: returns 202 Accepted immediately with submission id and QUEUED status', async () => {
    const start = Date.now();
    const result = await submissionsService.submitCode(TEST_USER_ID, {
      problemId,
      code: 'console.log("Hello 42");',
      language: 'javascript',
    });
    const elapsed = Date.now() - start;

    expect(result.id).toBeDefined();
    expect(result.status).toBe(SubmissionStatus.QUEUED);
    expect(elapsed).toBeLessThan(500);

    const stored = memoryDb.submissions.get(result.id);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe(SubmissionStatus.QUEUED);
  });

  it('lists submissions for user with cursor pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await submissionsService.submitCode(TEST_USER_ID, {
        problemId,
        code: `console.log(${i});`,
        language: 'javascript',
      });
    }

    const res = await submissionsService.listSubmissions(TEST_USER_ID, { limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBeDefined();
  });
});
