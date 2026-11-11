import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProblemDifficulty } from '@judge/shared';
import { memoryDb } from '../src/config/db.js';
import { minioService } from '../src/config/minio.js';
import { problems, testCases } from '../src/db/schema.js';

const TEST_SETTER_ID = '11111111-1111-4111-8111-111111111111';

function rowToRecord(p: typeof memoryDb.problems extends Map<any, infer V> ? V : never) {
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

let listQueryOverride: Array<ReturnType<typeof rowToRecord>> | null = null;

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
            is_archived: vals.isArchived ?? false,
            created_at: now,
            updated_at: now,
          };
          memoryDb.problems.set(row.id, row);
          return { returning: async () => [rowToRecord(row)] };
        }
        if (table === testCases) {
          const list = Array.isArray(vals) ? vals : [vals];
          const now = new Date();
          for (const item of list) {
            memoryDb.testCases.set(item.id, {
              id: item.id,
              problem_id: item.problemId,
              index: item.index,
              input_key: item.inputKey,
              expected_output_key: item.expectedOutputKey,
              is_hidden: item.isHidden,
              created_at: now,
            });
          }
        }
        return Promise.resolve();
      },
    }),
  });

  return {
    db: {
      transaction: async (fn: (tx: ReturnType<typeof buildTx>) => Promise<any>) => fn(buildTx()),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => Array.from(memoryDb.problems.values()).map(rowToRecord),
            orderBy: () => {
              const rows =
                listQueryOverride ??
                Array.from(memoryDb.problems.values())
                  .filter((p) => !p.is_archived)
                  .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
                  .map(rowToRecord);
              const result: any = Promise.resolve(rows);
              result.limit = async (n: number) => rows.slice(0, n);
              return result;
            },
          }),
        }),
      }),
    },
    pool: { query: vi.fn(), end: vi.fn() },
    checkDatabaseConnection: vi.fn().mockResolvedValue(true),
    closeDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

import { problemsService } from '../src/modules/problems/problems.service.js';

describe('Problems Service (AC-PR-01 to AC-PR-05)', () => {
  beforeEach(() => {
    memoryDb.problems.clear();
    memoryDb.testCases.clear();
    listQueryOverride = null;
  });

  it('AC-PR-01: saves test cases into MinIO with keys referenced in DB', async () => {
    const created = await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Sum of Two Numbers',
      statement: 'Add two integers A and B.',
      difficulty: ProblemDifficulty.EASY,
      tags: ['math'],
      timeLimitMs: 1000,
      memoryLimitMb: 64,
      sampleInput: '3 5',
      sampleExpectedOutput: '8',
      testCases: [
        { input: '10 20', expectedOutput: '30', isHidden: true },
        { input: '100 200', expectedOutput: '300', isHidden: true },
      ],
    });

    const storedTests = Array.from(memoryDb.testCases.values()).filter(
      (tc) => tc.problem_id === created.id
    );
    expect(storedTests).toHaveLength(2);
    expect(storedTests[0].input_key).toBe(`problems/${created.id}/test_0_in.txt`);
    expect(storedTests[0].expected_output_key).toBe(`problems/${created.id}/test_0_out.txt`);

    const storedInput = await minioService.getObject(storedTests[0].input_key);
    expect(storedInput).toBe('10 20');
  });

  it('AC-PR-02: never reveals hidden test cases in problem details API response', async () => {
    const created = await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Secret Problem',
      statement: 'Find the secret integer.',
      difficulty: ProblemDifficulty.HARD,
      tags: ['security'],
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      sampleInput: '1',
      sampleExpectedOutput: '1',
      testCases: [
        { input: 'SECRET_TOP_CONFIDENTIAL', expectedOutput: 'SECRET_FLAG', isHidden: true },
      ],
    });

    const fetched = await problemsService.getProblem(created.id);
    const jsonString = JSON.stringify(fetched);

    expect(jsonString).not.toContain('SECRET_TOP_CONFIDENTIAL');
    expect(jsonString).not.toContain('SECRET_FLAG');
    expect((fetched as any).testCases).toBeUndefined();
  });

  it('AC-PR-03: ranks search results and combines filters with AND', async () => {
    await problemsService.createProblem(TEST_SETTER_ID, {
      title: 'Binary Search Tree',
      statement: 'Search in a binary tree',
      difficulty: ProblemDifficulty.MEDIUM,
      tags: ['tree', 'binary-search'],
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      sampleInput: '',
      sampleExpectedOutput: '',
    });

    const target = Array.from(memoryDb.problems.values()).find(
      (p) => p.title === 'Binary Search Tree'
    )!;
    listQueryOverride = [rowToRecord(target)];

    const result = await problemsService.listProblems({
      search: 'binary',
      difficulty: ProblemDifficulty.MEDIUM,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Binary Search Tree');
  });

  it('AC-PR-04: supports cursor pagination with no duplicate or skipped items', async () => {
    for (let i = 1; i <= 5; i++) {
      const p = await problemsService.createProblem(TEST_SETTER_ID, {
        title: `Problem ${i}`,
        statement: `Statement ${i}`,
        difficulty: ProblemDifficulty.EASY,
        tags: [],
        timeLimitMs: 2000,
        memoryLimitMb: 128,
        sampleInput: '',
        sampleExpectedOutput: '',
      });
      memoryDb.problems.get(p.id)!.created_at = new Date(1000 + i * 100);
    }

    const page1 = await problemsService.listProblems({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();

    const ordered = Array.from(memoryDb.problems.values()).sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime()
    );
    listQueryOverride = ordered.slice(2).map(rowToRecord);

    const page2 = await problemsService.listProblems({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);

    const page1Ids = page1.items.map((p) => p.id);
    const page2Ids = page2.items.map((p) => p.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });
});
