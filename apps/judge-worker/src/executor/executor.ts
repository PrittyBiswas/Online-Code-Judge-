import {
  runInSandbox,
  type SandboxExecutionResult,
  type SandboxOptions,
} from '../sandbox/runner.js';
import { evaluator, EvaluatedSubmission } from '../evaluator/evaluator.js';
import { Verdict, TestCaseResult, SubmissionJobData } from '@judge/shared';

export interface TestCasePayload {
  index: number;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export type SandboxRunnerFn = (options: SandboxOptions) => Promise<SandboxExecutionResult>;

export class Executor {
  constructor(private readonly sandboxRunner: SandboxRunnerFn = runInSandbox) {}

  /**
   * Executes a submission against ordered test cases inside disposable Docker containers.
   * Stops early on the first non-ACCEPTED test case (AC-SJ-03).
   */
  async execute(
    job: SubmissionJobData,
    testCases: TestCasePayload[]
  ): Promise<EvaluatedSubmission> {
    const results: TestCaseResult[] = [];
    let finalVerdict: Verdict = Verdict.ACCEPTED;
    let failedTestIndex: number | undefined = undefined;
    let maxExecutionTimeMs = 0;
    let maxMemoryUsedKb = 0;

    for (const tc of testCases) {
      const sandboxResult = await this.sandboxRunner({
        code: job.code,
        input: tc.input,
        language: job.language,
        timeLimitMs: job.timeLimitMs,
        memoryLimitMb: job.memoryLimitMb,
      });

      maxExecutionTimeMs = Math.max(maxExecutionTimeMs, sandboxResult.executionTimeMs);
      maxMemoryUsedKb = Math.max(maxMemoryUsedKb, sandboxResult.memoryUsedKb);

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
