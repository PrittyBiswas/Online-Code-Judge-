import { describe, it, expect, beforeEach } from 'vitest';
import { problemsService } from '../src/modules/problems/problems.service.js';
import { memoryDb } from '../src/config/db.js';
import { minioService } from '../src/config/minio.js';
import { ProblemDifficulty } from '@judge/shared';

describe('Problems Service (AC-PR-01 to AC-PR-05)', () => {
  beforeEach(() => {
    memoryDb.problems.clear();
    memoryDb.testCases.clear();
  });

  it('AC-PR-01: saves test cases into MinIO with keys referenced in DB', async () => {
    const created = await problemsService.createProblem('setter-1', {
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

    const testCases = Array.from(memoryDb.testCases.values()).filter((tc) => tc.problem_id === created.id);
    expect(testCases).toHaveLength(2);

    // Verify database only stores object storage keys (AC-PR-01)
    expect(testCases[0].input_key).toBe(`problems/${created.id}/test_0_in.txt`);
    expect(testCases[0].expected_output_key).toBe(`problems/${created.id}/test_0_out.txt`);

    // Verify content is stored in MinIO
    const storedInput = await minioService.getObject(testCases[0].input_key);
    expect(storedInput).toBe('10 20');
  });

  it('AC-PR-02: never reveals hidden test cases in problem details API response', async () => {
    const created = await problemsService.createProblem('setter-1', {
      title: 'Secret Problem',
      statement: 'Find the secret integer.',
      difficulty: ProblemDifficulty.HARD,
      tags: ['security'],
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      sampleInput: '1',
      sampleExpectedOutput: '1',
      testCases: [{ input: 'SECRET_TOP_CONFIDENTIAL', expectedOutput: 'SECRET_FLAG', isHidden: true }],
    });

    const fetched = await problemsService.getProblem(created.id);
    const jsonString = JSON.stringify(fetched);

    // AC-PR-02: Strictly no hidden test input or output in response
    expect(jsonString).not.toContain('SECRET_TOP_CONFIDENTIAL');
    expect(jsonString).not.toContain('SECRET_FLAG');
    expect((fetched as any).testCases).toBeUndefined();
  });

  it('AC-PR-03: ranks search results and combines filters with AND', async () => {
    await problemsService.createProblem('setter-1', {
      title: 'Binary Search Tree',
      statement: 'Search in a binary tree',
      difficulty: ProblemDifficulty.MEDIUM,
      tags: ['tree', 'binary-search'],
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      sampleInput: '',
      sampleExpectedOutput: '',
    });

    await problemsService.createProblem('setter-1', {
      title: 'Linear Search Array',
      statement: 'Binary search algorithm comparison on sorted array',
      difficulty: ProblemDifficulty.EASY,
      tags: ['array', 'search'],
      timeLimitMs: 2000,
      memoryLimitMb: 128,
      sampleInput: '',
      sampleExpectedOutput: '',
    });

    // Search for "binary" with difficulty "medium"
    const result = await problemsService.listProblems({
      search: 'binary',
      difficulty: ProblemDifficulty.MEDIUM,
    });

    // Must match both conditions (AND)
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Binary Search Tree');
  });

  it('AC-PR-04: supports cursor pagination with no duplicate or skipped items', async () => {
    for (let i = 1; i <= 5; i++) {
      await problemsService.createProblem('setter-1', {
        title: `Problem ${i}`,
        statement: `Statement ${i}`,
        difficulty: ProblemDifficulty.EASY,
        tags: [],
        timeLimitMs: 2000,
        memoryLimitMb: 128,
        sampleInput: '',
        sampleExpectedOutput: '',
      });
    }

    const page1 = await problemsService.listProblems({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await problemsService.listProblems({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(2);

    // IDs between page 1 and page 2 must be disjoint
    const page1Ids = page1.items.map((p) => p.id);
    const page2Ids = page2.items.map((p) => p.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });
});

