import { z } from 'zod';
import { LIMITS } from '../constants/index.js';
import { SUPPORTED_LANGUAGES, Verdict } from '../types/index.js';

export const VERDICT_ABBREVIATION_MAP: Record<string, Verdict> = {
  AC: Verdict.ACCEPTED,
  WA: Verdict.WRONG_ANSWER,
  TLE: Verdict.TIME_LIMIT_EXCEEDED,
  MLE: Verdict.MEMORY_LIMIT_EXCEEDED,
  RE: Verdict.RUNTIME_ERROR,
  CE: Verdict.COMPILATION_ERROR,
  IE: Verdict.INTERNAL_ERROR,
};

export function normalizeVerdictFilter(raw?: string | null): Verdict | undefined {
  if (!raw || raw.trim().length === 0 || raw.toUpperCase() === 'ALL') {
    return undefined;
  }
  const upper = raw.trim().toUpperCase();
  if (upper in VERDICT_ABBREVIATION_MAP) {
    return VERDICT_ABBREVIATION_MAP[upper];
  }
  if (Object.values(Verdict).includes(upper as Verdict)) {
    return upper as Verdict;
  }
  return undefined;
}

export const createSubmissionSchema = z.object({
  problemId: z.string().uuid('Invalid problem ID format'),
  code: z
    .string()
    .min(1, 'Code cannot be empty')
    .refine((val) => Buffer.byteLength(val, 'utf8') <= LIMITS.MAX_CODE_SIZE_BYTES, {
      message: `Code size exceeds maximum allowed size of ${LIMITS.MAX_CODE_SIZE_BYTES / 1024} KB`,
    }),
  language: z.enum(SUPPORTED_LANGUAGES).default('javascript'),
  contestId: z.string().uuid('Invalid contest ID format').optional(),
});

export const runSampleSchema = z
  .object({
    problemId: z.string().uuid('Invalid problem ID format'),
    code: z
      .string()
      .min(1, 'Code cannot be empty')
      .refine((val) => Buffer.byteLength(val, 'utf8') <= LIMITS.MAX_CODE_SIZE_BYTES, {
        message: `Code size exceeds maximum allowed size of ${LIMITS.MAX_CODE_SIZE_BYTES / 1024} KB`,
      }),
    language: z.enum(SUPPORTED_LANGUAGES).default('javascript'),
    contestId: z.string().uuid('Invalid contest ID format').optional(),
    customInput: z
      .string()
      .refine((val) => Buffer.byteLength(val, 'utf8') <= LIMITS.MAX_CODE_SIZE_BYTES, {
        message: `Custom input size exceeds maximum allowed size of ${LIMITS.MAX_CODE_SIZE_BYTES / 1024} KB`,
      })
      .optional(),
  })
  .strict();

export const querySubmissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
  verdict: z.string().trim().optional(),
  language: z.string().trim().optional(),
  problemId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  cursor: z.string().optional(),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type RunSampleInput = z.infer<typeof runSampleSchema>;
export type QuerySubmissionsInput = z.infer<typeof querySubmissionsSchema>;
