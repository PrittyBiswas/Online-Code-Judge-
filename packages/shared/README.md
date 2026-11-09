# @judge/shared

Core domain contracts, validation schemas, constants, and utilities shared across all services in the Online Code Judge platform.

## Modules

- **`/types`**: TypeScript domain interfaces (`User`, `Problem`, `TestCase`, `Submission`, `Contest`, `LeaderboardEntry`, `Verdict`, `Role`).
- **`/schemas`**: Zod validation schemas for API inputs (`registerSchema`, `loginSchema`, `createProblemSchema`, `createSubmissionSchema`, `createContestSchema`).
- **`/constants`**: System-wide limits (64 KB code/output cap, process & memory bounds), Redis key namespaces, BullMQ queue names, and error codes.
- **`/utils`**:
  - `output-comparator.ts`: Production-grade whitespace and blank-line normalizer meeting AC-SJ-09.
  - `score.ts`: Mathematical score encoder/decoder for Redis Sorted Sets (Card 6) ensuring tie-breaking by penalty time.

