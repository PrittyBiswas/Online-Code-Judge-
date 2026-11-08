import { z } from 'zod';

export enum Role {
  USER = 'user',
  PROBLEM_SETTER = 'problem_setter',
  ADMIN = 'admin',
}

export enum Verdict {
  ACCEPTED = 'ACCEPTED',
  WRONG_ANSWER = 'WRONG_ANSWER',
  TIME_LIMIT_EXCEEDED = 'TIME_LIMIT_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  COMPILATION_ERROR = 'COMPILATION_ERROR',
  OUTPUT_LIMIT_EXCEEDED = 'OUTPUT_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export enum SubmissionStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
}

export interface TestCaseResult {
  index: number;
  verdict: Verdict;
  executionTimeMs: number;
  memoryUsedKb: number;
  // Note: Hidden test input/output are NEVER returned
  sampleInput?: string;
  sampleExpectedOutput?: string;
  actualOutput?: string;
}

export interface SubmissionJobData {
  submissionId: string;
  problemId: string;
  userId: string;
  code: string;
  language: 'javascript' | 'python';
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface SubmissionEvent {
  submissionId: string;
  status: SubmissionStatus | Verdict;
  verdict?: Verdict;
  failedTestIndex?: number;
  executionTimeMs?: number;
  memoryUsedKb?: number;
}

