import { runInSandbox } from '../sandbox/runner.js';
import { evaluator, EvaluatedSubmission } from '../evaluator/evaluator.js';
import { Verdict, TestCaseResult, SubmissionJobData } from '@judge/shared';

export interface TestCasePayload {
  index: number;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export class Executor {
  /**
   * Executes a submission against its test cases in fresh locked-down containers.
   * Stops early at the first failing test (Part 1 M3).
   */
  async execute(
    job: SubmissionJobData,
    testCases: TestCasePayload[]
  ): Promise<EvaluatedSubmission> {
    const results: TestCaseResult[] = [];
    let finalVerdict: Verdict = Verdict.ACCEPTED;
    let failedTestIndex: number | undefined = undefined;
    let maxExecutionTimeMs = 0;
    const maxMemoryUsedKb = 0;

    for (const tc of testCases) {
      const sandboxResult = await runInSandbox({
        code: job.code,
        input: tc.input,
        timeLimitMs: job.timeLimitMs,
        memoryLimitMb: job.memoryLimitMb,
      });

      maxExecutionTimeMs = Math.max(maxExecutionTimeMs, sandboxResult.executionTimeMs);

      const testResult = evaluator.evaluateTest(
        tc.index,
        sandboxResult,
        tc.expectedOutput,
        tc.isHidden,
        tc.input
      );

      results.push(testResult);

      if (testResult.verdict !== Verdict.ACCEPTED) {
        finalVerdict = testResult.verdict;
        failedTestIndex = tc.index;
        // Stop Early Rule: Do not run remaining tests (Part 1 M3 / AC-SJ-03)
        break;
      }
    }

    return {
      finalVerdict,
      failedTestIndex,
      results,
      maxExecutionTimeMs,
      maxMemoryUsedKb,
    };
  }
}

export const executor = new Executor();
