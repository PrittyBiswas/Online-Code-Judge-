import { describe, it, expect } from 'vitest';
import { UserProblemStatus } from '@judge/shared';

describe('Submission Status Computation Logic', () => {
  function computeStatus(
    problemId: string,
    userSubmissions: Array<{ problemId: string; verdict: string }>
  ): UserProblemStatus {
    const subs = userSubmissions.filter((s) => s.problemId === problemId);
    if (subs.length === 0) return 'UNATTEMPTED';
    const isSolved = subs.some((s) => s.verdict === 'ACCEPTED');
    return isSolved ? 'SOLVED' : 'ATTEMPTED';
  }

  it('marks problem as UNATTEMPTED when user has no official submissions', () => {
    const status = computeStatus('prob-1', []);
    expect(status).toBe('UNATTEMPTED');
  });

  it('marks problem as ATTEMPTED when user has submissions but none is ACCEPTED', () => {
    const status = computeStatus('prob-1', [
      { problemId: 'prob-1', verdict: 'WRONG_ANSWER' },
      { problemId: 'prob-1', verdict: 'TIME_LIMIT_EXCEEDED' },
    ]);
    expect(status).toBe('ATTEMPTED');
  });

  it('marks problem as SOLVED when user has at least one ACCEPTED submission', () => {
    const status = computeStatus('prob-1', [
      { problemId: 'prob-1', verdict: 'WRONG_ANSWER' },
      { problemId: 'prob-1', verdict: 'ACCEPTED' },
    ]);
    expect(status).toBe('SOLVED');
  });

  it('isolates problems so attempts on problem A do not affect problem B', () => {
    const subs = [
      { problemId: 'prob-A', verdict: 'ACCEPTED' },
      { problemId: 'prob-B', verdict: 'WRONG_ANSWER' },
    ];

    expect(computeStatus('prob-A', subs)).toBe('SOLVED');
    expect(computeStatus('prob-B', subs)).toBe('ATTEMPTED');
    expect(computeStatus('prob-C', subs)).toBe('UNATTEMPTED');
  });
});
