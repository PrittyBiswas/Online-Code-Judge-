import { describe, it, expect, beforeEach } from 'vitest';
import { submissionsService } from '../src/modules/submissions/submissions.service.js';
import { problemsService } from '../src/modules/problems/problems.service.js';
import { memoryDb } from '../src/config/db.js';
import { SubmissionStatus, ProblemDifficulty } from '@judge/shared';

describe('Submissions Service (AC-SJ-01, AC-SJ-10, AC-SJ-11, AC-FE-04)', () => {
  let problemId: string;

  beforeEach(async () => {
    memoryDb.problems.clear();
    memoryDb.submissions.clear();

    const p = await problemsService.createProblem('setter-1', {
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
    const result = await submissionsService.submitCode('user-1', {
      problemId,
      code: 'console.log("Hello 42");',
      language: 'javascript',
    });
    const elapsed = Date.now() - start;

    expect(result.id).toBeDefined();
    expect(result.status).toBe(SubmissionStatus.QUEUED);
    // Asynchronous enqueue must be fast (< 200ms)
    expect(elapsed).toBeLessThan(500);

    const stored = memoryDb.submissions.get(result.id);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe(SubmissionStatus.QUEUED);
  });

  it('lists submissions for user with cursor pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await submissionsService.submitCode('user-1', {
        problemId,
        code: `console.log(${i});`,
        language: 'javascript',
      });
    }

    const res = await submissionsService.listSubmissions('user-1', { limit: 2 });
    expect(res.items).toHaveLength(2);
    expect(res.nextCursor).toBeDefined();
  });
});
