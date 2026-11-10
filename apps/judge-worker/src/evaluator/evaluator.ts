import { Verdict, TestCaseResult, compareOutputs } from '@judge/shared';
import { SandboxExecutionResult } from '../sandbox/runner.js';

export interface EvaluatedSubmission {
  finalVerdict: Verdict;
  failedTestIndex?: number;
  results: TestCaseResult[];
  maxExecutionTimeMs: number;
  maxMemoryUsedKb: number;
}

export class Evaluator {
  /**
   * Evaluates test results according to AC-SJ-02, AC-SJ-03, AC-SJ-09.
   * Stop Early (Part 1 M3): Stops at the first failing test and reveals only its index.
   * Never leaks hidden test content (AC-PR-02, AC-SJ-03).
   */
  evaluateTest(
    index: number,
    sandboxResult: SandboxExecutionResult,
    expectedOutput: string,
    isHidden: boolean,
    sampleInput?: string
  ): TestCaseResult {
    // If sandbox produced a non-accepted verdict (timeout, memory, runtime, compile, output)
    if (sandboxResult.verdict !== Verdict.ACCEPTED) {
      return {
        index,
        verdict: sandboxResult.verdict,
        executionTimeMs: sandboxResult.executionTimeMs,
        memoryUsedKb: 0,
        sampleInput: isHidden ? undefined : sampleInput,
        sampleExpectedOutput: isHidden ? undefined : expectedOutput,
        actualOutput: isHidden ? undefined : sandboxResult.stdout,
      };
    }

    // Compare output with AC-SJ-09 whitespace trimming rules
    const matches = compareOutputs(sandboxResult.stdout, expectedOutput);
    const verdict = matches ? Verdict.ACCEPTED : Verdict.WRONG_ANSWER;

    return {
      index,
      verdict,
      executionTimeMs: sandboxResult.executionTimeMs,
      memoryUsedKb: 0,
      sampleInput: isHidden ? undefined : sampleInput,
      sampleExpectedOutput: isHidden ? undefined : expectedOutput,
      actualOutput: isHidden ? undefined : sandboxResult.stdout,
    };
  }
}

export const evaluator = new Evaluator();
