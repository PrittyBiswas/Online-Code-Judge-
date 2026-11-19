import { describe, it, expect } from 'vitest';
import { Verdict } from '@judge/shared';
import { Evaluator } from '../../judge-worker/src/evaluator/evaluator.js';

describe('Hidden Test Security Verification', () => {
  const evaluator = new Evaluator();

  it('strips input, expected output, and stdout for hidden test cases', () => {
    const sandboxResult = {
      stdout: '42\n',
      stderr: 'internal debug info',
      exitCode: 0,
      executionTimeMs: 15,
      memoryUsedKb: 10240,
      verdict: Verdict.WRONG_ANSWER,
      timedOut: false,
    };

    const evaluated = evaluator.evaluateTest(
      0,
      sandboxResult,
      '100\n',
      true, // isHidden = true
      'secret input payload'
    );

    expect(evaluated.isHidden).toBe(true);
    expect(evaluated.verdict).toBe(Verdict.WRONG_ANSWER);
    expect(evaluated.sampleInput).toBeUndefined();
    expect(evaluated.sampleExpectedOutput).toBeUndefined();
    expect(evaluated.actualOutput).toBeUndefined();
    expect(evaluated.diagnostic).toBeUndefined();
  });

  it('surfaces input, expected output, and stdout for public sample cases', () => {
    const sandboxResult = {
      stdout: '42\n',
      stderr: '',
      exitCode: 0,
      executionTimeMs: 15,
      memoryUsedKb: 10240,
      verdict: Verdict.ACCEPTED,
      timedOut: false,
    };

    const evaluated = evaluator.evaluateTest(
      0,
      sandboxResult,
      '42\n',
      false, // isHidden = false
      'public input'
    );

    expect(evaluated.isHidden).toBe(false);
    expect(evaluated.verdict).toBe(Verdict.ACCEPTED);
    expect(evaluated.sampleInput).toBe('public input');
    expect(evaluated.sampleExpectedOutput).toBe('42\n');
    expect(evaluated.actualOutput).toBe('42\n');
  });
});
