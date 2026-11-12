import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  createProblemSchema,
  createSubmissionSchema,
  createContestSchema,
} from '../src/schemas/index.js';
import { LIMITS } from '../src/constants/index.js';

describe('Shared Schema Validations', () => {
  describe('Auth Schemas', () => {
    it('accepts valid register input', () => {
      const valid = {
        username: 'alice_wonder',
        email: 'alice@example.com',
        password: 'secure_password_123',
      };
      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid username characters', () => {
      const invalid = {
        username: 'alice@bad!',
        email: 'alice@example.com',
        password: 'secure_password_123',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates login schema', () => {
      expect(loginSchema.safeParse({ usernameOrEmail: 'alice', password: 'pwd' }).success).toBe(
        true
      );
      expect(loginSchema.safeParse({ usernameOrEmail: '', password: '' }).success).toBe(false);
    });
  });

  describe('Problem Schemas', () => {
    it('accepts valid problem creation data', () => {
      const problem = {
        title: 'Two Sum Problem',
        statement:
          'Given an array of integers, return indices of the two numbers that add up to target.',
        difficulty: 'easy',
        tags: ['array', 'hashmap'],
        timeLimitMs: 2000,
        memoryLimitMb: 128,
        sampleInput: '4\n2 7 11 15\n9',
        sampleExpectedOutput: '0 1',
      };
      const result = createProblemSchema.safeParse(problem);
      expect(result.success).toBe(true);
    });

    it('rejects invalid time limit exceeding maximum boundary', () => {
      const invalid = {
        title: 'Slow Problem',
        statement: 'This problem allows way too much time.',
        timeLimitMs: 9999999,
      };
      const result = createProblemSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Submission Schemas', () => {
    it('accepts valid submission within size limit', () => {
      const sub = {
        problemId: '123e4567-e89b-12d3-a456-426614174000',
        code: 'console.log("Hello, World!");',
        language: 'javascript',
      };
      expect(createSubmissionSchema.safeParse(sub).success).toBe(true);
    });

    it('rejects submissions exceeding the MAX_CODE_SIZE_BYTES cap (EC-07)', () => {
      const oversizedCode = 'a'.repeat(LIMITS.MAX_CODE_SIZE_BYTES + 10);
      const sub = {
        problemId: '123e4567-e89b-12d3-a456-426614174000',
        code: oversizedCode,
        language: 'javascript',
      };
      const result = createSubmissionSchema.safeParse(sub);
      expect(result.success).toBe(false);
    });

    it('rejects empty source code, unsupported languages, and missing/invalid problemId', () => {
      expect(
        createSubmissionSchema.safeParse({
          problemId: '123e4567-e89b-12d3-a456-426614174000',
          code: '',
          language: 'javascript',
        }).success
      ).toBe(false);

      expect(
        createSubmissionSchema.safeParse({
          problemId: '123e4567-e89b-12d3-a456-426614174000',
          code: 'print(1)',
          language: 'cpp',
        }).success
      ).toBe(false);

      expect(
        createSubmissionSchema.safeParse({
          problemId: 'not-a-uuid',
          code: 'console.log(1)',
          language: 'javascript',
        }).success
      ).toBe(false);

      expect(
        createSubmissionSchema.safeParse({
          code: 'console.log(1)',
          language: 'javascript',
        }).success
      ).toBe(false);
    });
  });

  describe('Contest Schemas', () => {
    it('validates start and end time order', () => {
      const valid = {
        title: 'Weekly Contest 1',
        description: 'First public contest',
        startTime: '2026-11-10T10:00:00.000Z',
        endTime: '2026-11-10T12:00:00.000Z',
        freezeMinutes: 30,
        problemIds: ['123e4567-e89b-12d3-a456-426614174000'],
      };
      expect(createContestSchema.safeParse(valid).success).toBe(true);

      const invalid = {
        ...valid,
        startTime: '2026-11-10T15:00:00.000Z',
        endTime: '2026-11-10T12:00:00.000Z',
      };
      expect(createContestSchema.safeParse(invalid).success).toBe(false);
    });
  });
});
