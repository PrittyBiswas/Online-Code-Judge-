import { UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { z } from 'zod';
import {
  LIMITS,
  RATE_LIMITS,
  REDIS_KEYS,
  SampleRunJobData,
  SampleRunOutcome,
  SampleRunResult,
  SampleRunStatus,
  Verdict,
} from '@judge/shared';
import { runInSandbox, SandboxExecutionResult, SandboxOptions } from '../sandbox/runner.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'judge-worker-sample' },
});

const SAMPLE_OUTPUT_MAX_CHARS = LIMITS.OUTPUT_TRUNCATION_LIMIT * 4;

const sampleRunJobSchema = z
  .object({
    type: z.literal('SAMPLE_RUN'),
    runId: z.string().uuid(),
    problemId: z.string().uuid(),
    userId: z.string().uuid(),
    code: z
      .string()
      .min(1)
      .refine((val) => Buffer.byteLength(val, 'utf8') <= LIMITS.MAX_CODE_SIZE_BYTES),
    language: z.enum(['javascript', 'python']),
    sampleInput: z.string(),
    timeLimitMs: z.number().int().min(100).max(LIMITS.MAX_TIME_LIMIT_MS),
    memoryLimitMb: z.number().int().min(16).max(LIMITS.MAX_MEMORY_LIMIT_MB),
  })
  .strict();

export interface StoredSampleRunState extends SampleRunResult {
  userId: string;
}

export interface SampleRunDeps {
  redisClient: Pick<Redis, 'get' | 'set'>;
  sandboxRunner?: (options: SandboxOptions) => Promise<SandboxExecutionResult>;
}

function boundText(value: string): string {
  if (value.length <= SAMPLE_OUTPUT_MAX_CHARS) return value;
  return `${value.slice(0, SAMPLE_OUTPUT_MAX_CHARS)}\n... [output truncated]`;
}

function mapSandboxVerdictToOutcome(res: SandboxExecutionResult): {
  status: SampleRunStatus;
  outcome: SampleRunOutcome;
  errorMessage?: string;
} {
  if (res.infraFailureCategory || res.verdict === Verdict.INTERNAL_ERROR) {
    return {
      status: 'FAILED',
      outcome: 'INTERNAL_ERROR',
      errorMessage: 'Sandbox infrastructure failed while executing sample code.',
    };
  }

  switch (res.verdict) {
    case Verdict.ACCEPTED:
      return { status: 'COMPLETED', outcome: 'SUCCESS' };
    case Verdict.COMPILATION_ERROR:
      return { status: 'COMPLETED', outcome: 'COMPILATION_ERROR' };
    case Verdict.RUNTIME_ERROR:
      return { status: 'COMPLETED', outcome: 'RUNTIME_ERROR' };
    case Verdict.TIME_LIMIT_EXCEEDED:
      return { status: 'COMPLETED', outcome: 'TIME_LIMIT_EXCEEDED' };
    case Verdict.MEMORY_LIMIT_EXCEEDED:
      return { status: 'COMPLETED', outcome: 'MEMORY_LIMIT_EXCEEDED' };
    case Verdict.OUTPUT_LIMIT_EXCEEDED:
      return { status: 'COMPLETED', outcome: 'OUTPUT_LIMIT_EXCEEDED' };
    default:
      return {
        status: 'FAILED',
        outcome: 'INTERNAL_ERROR',
        errorMessage: 'Unexpected sandbox verdict.',
      };
  }
}

async function readExistingState(
  redisClient: Pick<Redis, 'get'>,
  runId: string
): Promise<Partial<StoredSampleRunState>> {
  try {
    const raw = await redisClient.get(REDIS_KEYS.SAMPLE_RUN_JOB(runId));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<StoredSampleRunState>;
  } catch {
    return {};
  }
}

async function writeSampleState(
  redisClient: Pick<Redis, 'set'>,
  state: StoredSampleRunState
): Promise<void> {
  await redisClient.set(
    REDIS_KEYS.SAMPLE_RUN_JOB(state.runId),
    JSON.stringify(state),
    'EX',
    RATE_LIMITS.SAMPLE_RUN_TTL_SECONDS
  );
}

export async function processSampleRunJob(
  rawJobData: unknown,
  deps: SampleRunDeps
): Promise<SampleRunResult> {
  const parsed = sampleRunJobSchema.safeParse(rawJobData);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues.length }, 'Rejected malformed sample-run job');
    throw new UnrecoverableError('Malformed sample-run job payload');
  }

  const job: SampleRunJobData = parsed.data;
  const sandboxRunner = deps.sandboxRunner ?? runInSandbox;
  const existing = await readExistingState(deps.redisClient, job.runId);
  const createdAt = existing.createdAt || new Date().toISOString();

  await writeSampleState(deps.redisClient, {
    runId: job.runId,
    problemId: job.problemId,
    userId: job.userId,
    language: job.language,
    status: 'RUNNING',
    expectedOutput: existing.expectedOutput,
    createdAt,
    updatedAt: new Date().toISOString(),
  });

  logger.info(
    { runId: job.runId, problemId: job.problemId, language: job.language },
    'Executing sample run in Docker sandbox'
  );

  let sandboxResult: SandboxExecutionResult;
  try {
    sandboxResult = await sandboxRunner({
      code: job.code,
      input: job.sampleInput,
      language: job.language,
      timeLimitMs: job.timeLimitMs,
      memoryLimitMb: job.memoryLimitMb,
    });
  } catch (err) {
    const failedState: StoredSampleRunState = {
      runId: job.runId,
      problemId: job.problemId,
      userId: job.userId,
      language: job.language,
      status: 'FAILED',
      outcome: 'INTERNAL_ERROR',
      errorMessage: 'Sample execution failed due to a sandbox runner error.',
      expectedOutput: existing.expectedOutput,
      createdAt,
      updatedAt: new Date().toISOString(),
    };
    await writeSampleState(deps.redisClient, failedState).catch(() => {});
    logger.error(
      { runId: job.runId, err: err instanceof Error ? err.message : 'unknown' },
      'Sample run sandbox invocation threw'
    );
    return failedState;
  }

  const mapped = mapSandboxVerdictToOutcome(sandboxResult);
  const finalState: StoredSampleRunState = {
    runId: job.runId,
    problemId: job.problemId,
    userId: job.userId,
    language: job.language,
    status: mapped.status,
    outcome: mapped.outcome,
    stdout: boundText(sandboxResult.stdout),
    stderr: boundText(sandboxResult.stderr),
    expectedOutput: existing.expectedOutput,
    executionTimeMs: sandboxResult.executionTimeMs,
    memoryUsedKb: sandboxResult.memoryUsedKb,
    exitCode: sandboxResult.exitCode,
    errorMessage: mapped.errorMessage,
    createdAt,
    updatedAt: new Date().toISOString(),
  };

  await writeSampleState(deps.redisClient, finalState);

  logger.info(
    {
      runId: job.runId,
      problemId: job.problemId,
      language: job.language,
      status: finalState.status,
      outcome: finalState.outcome,
      executionTimeMs: finalState.executionTimeMs,
    },
    'Completed sample run execution'
  );

  return finalState;
}
