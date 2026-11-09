import { z } from 'zod';
import { ProblemDifficulty } from '../types/index.js';
import { LIMITS } from '../constants/index.js';

export const testCaseInputSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
  isHidden: z.boolean().default(true),
});

export const createProblemSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120),
  statement: z.string().min(10, 'Problem statement must be at least 10 characters'),
  difficulty: z.nativeEnum(ProblemDifficulty).default(ProblemDifficulty.MEDIUM),
  tags: z.array(z.string()).default([]),
  timeLimitMs: z.number().int().min(100).max(LIMITS.MAX_TIME_LIMIT_MS).default(LIMITS.DEFAULT_TIME_LIMIT_MS),
  memoryLimitMb: z.number().int().min(16).max(LIMITS.MAX_MEMORY_LIMIT_MB).default(LIMITS.DEFAULT_MEMORY_LIMIT_MB),
  sampleInput: z.string().default(''),
  sampleExpectedOutput: z.string().default(''),
  testCases: z.array(testCaseInputSchema).optional().default([]),
});

export const updateProblemSchema = createProblemSchema.partial();

export const queryProblemsSchema = z.object({
  search: z.string().optional(),
  difficulty: z.nativeEnum(ProblemDifficulty).optional(),
  tag: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateProblemInput = z.infer<typeof createProblemSchema>;
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;
export type QueryProblemsInput = z.infer<typeof queryProblemsSchema>;
export type TestCaseInput = z.infer<typeof testCaseInputSchema>;

