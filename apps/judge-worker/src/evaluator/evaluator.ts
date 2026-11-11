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
   * Compares output via normalizeOutput/compareOutputs and never exposes hidden test contents.
   */
  evaluateTest(
    index: number,
    sandboxResult: SandboxExecutionResult,
    expectedOutput: string,
    isHidden: boolean,
    sampleInput?: string
  ): TestCaseResult {
    if (sandboxResult.verdict !== Verdict.ACCEPTED) {
      return {
        index,
        verdict: sandboxResult.verdict,
        executionTimeMs: sandboxResult.executionTimeMs,
        memoryUsedKb: sandboxResult.memoryUsedKb,
        sampleInput: isHidden ? undefined : sampleInput,
        sampleExpectedOutput: isHidden ? undefined : expectedOutput,
        actualOutput: isHidden ? undefined : sandboxResult.stdout,
      };
    }

    const matches = compareOutputs(sandboxResult.stdout, expectedOutput);
    const verdict = matches ? Verdict.ACCEPTED : Verdict.WRONG_ANSWER;

    return {
      index,
      verdict,
      executionTimeMs: sandboxResult.executionTimeMs,
      memoryUsedKb: sandboxResult.memoryUsedKb,
      sampleInput: isHidden ? undefined : sampleInput,
      sampleExpectedOutput: isHidden ? undefined : expectedOutput,
      actualOutput: isHidden ? undefined : sandboxResult.stdout,
    };
  }
}

export const evaluator = new Evaluator();
