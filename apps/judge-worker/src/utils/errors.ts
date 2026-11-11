import { UnrecoverableError } from 'bullmq';

export type WorkerFailureCategory =
  | 'INVALID_JOB_DATA'
  | 'SUBMISSION_NOT_FOUND'
  | 'PROBLEM_NOT_FOUND'
  | 'UNSUPPORTED_LANGUAGE'
  | 'MISSING_TEST_CASES'
  | 'MISSING_TEST_CASE_OBJECT'
  | 'DOCKER_DAEMON_UNAVAILABLE'
  | 'SANDBOX_CONTAINER_START_FAILED'
  | 'OBJECT_STORAGE_TRANSIENT_ERROR'
  | 'DATABASE_TRANSIENT_ERROR'
  | 'REDIS_TRANSIENT_ERROR'
  | 'UNKNOWN_TRANSIENT_ERROR';

/**
 * Permanent failure that should NEVER be retried by BullMQ.
 */
export class PermanentWorkerError extends UnrecoverableError {
  public readonly category: WorkerFailureCategory;

  constructor(category: WorkerFailureCategory, message: string) {
    super(message);
    this.name = 'PermanentWorkerError';
    this.category = category;
  }
}

/**
 * Retryable infrastructure/transient failure handled via BullMQ backoff or sweeper recovery.
 */
export class RetryableWorkerError extends Error {
  public readonly category: WorkerFailureCategory;

  constructor(category: WorkerFailureCategory, message: string) {
    super(message);
    this.name = 'RetryableWorkerError';
    this.category = category;
  }
}

export function classifyWorkerError(err: unknown): {
  category: WorkerFailureCategory;
  permanent: boolean;
  message: string;
} {
  if (err instanceof PermanentWorkerError) {
    return { category: err.category, permanent: true, message: err.message };
  }
  if (err instanceof UnrecoverableError) {
    return { category: 'INVALID_JOB_DATA', permanent: true, message: err.message };
  }
  if (err instanceof RetryableWorkerError) {
    return { category: err.category, permanent: false, message: err.message };
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('docker daemon') || lower.includes('dockerdesktoplinuxengine')) {
    return { category: 'DOCKER_DAEMON_UNAVAILABLE', permanent: false, message };
  }
  if (lower.includes('container') && lower.includes('start')) {
    return { category: 'SANDBOX_CONTAINER_START_FAILED', permanent: false, message };
  }
  if (lower.includes('object storage')) {
    return { category: 'OBJECT_STORAGE_TRANSIENT_ERROR', permanent: false, message };
  }
  if (lower.includes('redis') || lower.includes('connection is closed')) {
    return { category: 'REDIS_TRANSIENT_ERROR', permanent: false, message };
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('connection terminated') ||
    lower.includes('postgres') ||
    lower.includes('timeout')
  ) {
    return { category: 'DATABASE_TRANSIENT_ERROR', permanent: false, message };
  }

  return { category: 'UNKNOWN_TRANSIENT_ERROR', permanent: false, message };
}
