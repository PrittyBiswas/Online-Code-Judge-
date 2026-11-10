import { z } from 'zod';
import { LIMITS } from '../constants/index.js';

export const createSubmissionSchema = z.object({
  problemId: z.string().uuid('Invalid problem ID format'),
  code: z
    .string()
    .min(1, 'Code cannot be empty')
    .refine((val) => Buffer.byteLength(val, 'utf8') <= LIMITS.MAX_CODE_SIZE_BYTES, {
      message: `Code size exceeds maximum allowed size of ${LIMITS.MAX_CODE_SIZE_BYTES / 1024} KB`,
    }),
  language: z.enum(['javascript', 'python']).default('javascript'),
});

export const runSampleSchema = z.object({
  problemId: z.string().uuid('Invalid problem ID format'),
  code: z
    .string()
    .min(1, 'Code cannot be empty')
    .refine((val) => Buffer.byteLength(val, 'utf8') <= LIMITS.MAX_CODE_SIZE_BYTES, {
      message: `Code size exceeds maximum allowed size of ${LIMITS.MAX_CODE_SIZE_BYTES / 1024} KB`,
    }),
  language: z.enum(['javascript', 'python']).default('javascript'),
  customInput: z.string().optional(),
});

export const querySubmissionsSchema = z.object({
  problemId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type RunSampleInput = z.infer<typeof runSampleSchema>;
export type QuerySubmissionsInput = z.infer<typeof querySubmissionsSchema>;
