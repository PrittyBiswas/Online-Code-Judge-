# Online Code Judge — Project Checklist

This checklist tracks milestone completion across implementation days.

## Day 1 — Requirements Analysis & Architecture Design

- [x] Requirements analysis and system architecture defined
- [x] Security & sandbox lockdown rules documented (`docs/safety.md`)
- [x] Initial repository scaffolding, architecture notes (`docs/learning-notes.md`), and known-issues log (`docs/known-issues.md`)
- [x] Base `docker-compose.yml` defined for Postgres, Redis, and MinIO (excluding `judge-worker` and without Docker socket mount)

## Day 2 — Monorepo Setup & Project Foundation

- [x] Configure `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc` (`20`), and root `package.json` (`engines` + workspace scripts)
- [x] Configure TypeScript strict mode (`tsconfig.base.json`) and per-package `tsconfig.json`
- [x] Configure ESLint (TypeScript + React + React Hooks), Prettier, and `.editorconfig`
- [x] Configure `.gitignore` and `.env.example` (verify `.env` is untracked and no secrets are in Git)
- [x] Build & link `packages/shared` (`@judge/shared`) across workspace packages using `workspace:*`
- [x] Configure `apps/api` Express app (`GET /`, `GET /health/live`, centralized error handler, Zod env validation, `src/types/`)
- [x] Configure `apps/frontend` React + Vite + Tailwind CSS responsive shell (`Online Code Judge` home page importing `@judge/shared`)
- [x] Configure `apps/judge-worker` as a separate host-run TypeScript app (outside Docker Compose, no Docker socket mount)
- [x] Configure `apps/cron` and `apps/stub-mail` workspace packages
- [x] Add README files for root, every app, and `packages/shared`
- [x] Verify `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`, `pnpm env:validate`, API dev server, and frontend dev server
- [x] Update `docs/changelog.md` and `docs/project-checklist.md`

## Day 3 — Infrastructure Setup (PostgreSQL + Redis + MinIO)

- [x] Configure `postgres` (`postgres:16-alpine`), `redis` (`redis:7-alpine`, AOF enabled), and `minio` (`minio/minio:latest`) in `docker-compose.yml`
- [x] Bind all published infrastructure ports strictly to `127.0.0.1` (never `0.0.0.0`)
- [x] Configure persistent named volumes (`postgres_data`, `redis_data`, `minio_data`) and idempotent `create-buckets`
- [x] Configure non-missing utility health checks (`pg_isready`, `redis-cli ping`, `mc ready local`)
- [x] Document environment variables in `.env.example`, extend `scripts/verify-environment.ts`, and wire `REDIS_URL` into `apps/api/src/config/queue.ts`
- [x] Add real connectivity check (`scripts/verify-infrastructure.ts`) and Compose config tests (`apps/api/tests/infrastructure-config.test.ts`)
- [x] Document setup, volume safety, and operations in `docs/infrastructure.md`, `README.md`, and `docs/changelog.md`
- [x] Keep `apps/judge-worker` outside Docker Compose and verify zero `docker.sock` exposure
- [x] Live container runtime verification via `docker compose up -d && pnpm infra:verify`

## Day 4 — PostgreSQL Integration and Drizzle ORM Setup

- [x] Install `drizzle-orm`, `pg`, `@types/pg`, and `drizzle-kit` in `apps/api`
- [x] Configure Drizzle connection (`apps/api/src/db/index.ts`), Drizzle Kit (`apps/api/drizzle.config.ts`), and `DATABASE_URL` env derivation
- [x] Define initial core schema (`users`, `problems`, `test_cases`, `submissions`) with keys, constraints, timestamps, and indexes in `apps/api/src/db/schema.ts`
- [x] Generate (`pnpm db:generate`) and apply (`pnpm db:migrate`) initial SQL migration (`drizzle/migrations/0000_new_millenium_guard.sql`)
- [x] Verify live DB connection, schema tables, insert/read, and foreign key enforcement (`pnpm db:verify`)
- [x] Update `docs/learning-notes.md`, `README.md`, `apps/api/README.md`, and `docs/changelog.md`

## Day 5 — PostgreSQL CRUD Integration with Drizzle ORM

- [x] Migrate `authService` and `usersService` to PostgreSQL CRUD via Drizzle ORM (bcrypt hashes preserved, never exposed)
- [x] Migrate `problemsService` to transactional PostgreSQL CRUD (`createProblem`, `getProblem` by ID/slug, `listProblems`, `updateProblem`, `deleteProblem`)
- [x] Migrate `submissionsService` (plus `adminService`, `leaderboardService`, `sse.ts`, and `contestsService` user/submission queries) to PostgreSQL
- [x] Add safe PostgreSQL error mapping (`apps/api/src/utils/db-error.ts`) and `isUuid()` validation
- [x] Add real PostgreSQL integration test suite (`apps/api/tests/postgres.integration.test.ts` / `pnpm test:integration`) with isolated cleanup
- [x] Verify `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:integration`, and `pnpm infra:verify`
- [x] Update `docs/learning-notes.md`, `README.md`, `apps/api/README.md`, `docs/changelog.md`, and `docs/project-checklist.md`

## Day 6 — Judge Worker Integration

- [x] Add Drizzle ORM + `pg` connection (`apps/judge-worker/src/db/`) and Zod env config (`src/config/env.ts`)
- [x] Add AWS Signature V4 MinIO/Silo object storage client in worker and API (`src/storage/minio.ts`, `apps/api/src/config/minio.ts`)
- [x] Implement BullMQ worker loop (`src/queue/worker.ts`) and idempotent submission processor (`src/processor/judgeProcessor.ts`)
- [x] Support isolated JavaScript & Python sandbox execution with compilation/syntax check, TLE/OLE/MLE/RE/WA/AC verdicts, memory tracking, and awaited `docker rm -f` cleanup
- [x] Add worker unit tests (`tests/worker-unit.test.ts`) and live Docker + BullMQ + Postgres + Silo integration tests (`tests/worker.integration.test.ts`)
- [x] Update `apps/judge-worker/README.md`, `README.md`, `docs/changelog.md`, and `docs/project-checklist.md`

## Day 7 — Judge Worker Reliability, Recovery & Failure Handling

- [x] Implement `SubmissionRecoveryService` (`apps/judge-worker/src/recovery/recoveryService.ts`) with age threshold (`RECOVERY_STALE_MS`), active BullMQ job protection, max-attempt `INTERNAL_ERROR` finalization, and orphan container pruning
- [x] Implement optimistic CAS claiming (`claimSubmissionRunning`), duplicate Attempt 1 rejection, and retryable `RUNNING -> QUEUED` release (`releaseSubmissionToQueued`) in `apps/judge-worker/src/processor/judgeProcessor.ts`
- [x] Configure BullMQ lock duration, stalled job interval/threshold, and failure classification (`PermanentWorkerError` vs `RetryableWorkerError`) in `apps/judge-worker/src/queue/worker.ts` & `src/utils/errors.ts`
- [x] Harden Docker sandbox daemon/startup failure classification (`125`/`126`/`127`) and container cleanup logging (`src/sandbox/runner.ts`, `src/recovery/shutdown.ts`)
- [x] Expand unit tests (`worker-unit.test.ts`) and live integration tests (`worker.integration.test.ts`) covering recovery, concurrent claims, error classification, output/memory limits, and container cleanup
- [x] Update `apps/judge-worker/README.md`, `docs/changelog.md`, and `docs/project-checklist.md`

## Day 8 — Judge Engine Testing & Edge Cases

- [x] Expand unit tests for output comparison (`CRLF`/`LF`, whitespace/tabs, Unicode, large outputs) and submission schema validation (`packages/shared/tests/`)
- [x] Expand judge worker unit tests for hidden-test redaction, large test suites, corrupted/empty payloads, and exit code `125`/`126`/`127` handling (`apps/judge-worker/tests/worker-unit.test.ts`)
- [x] Verify live Docker isolation (`attack-suite`: network, filesystem, fork-bomb, privilege escalation) and JS/Python I/O + resource limits with zero leaked containers (`apps/judge-worker/tests/worker.integration.test.ts`)
- [x] Verify full API + PostgreSQL + BullMQ + MinIO/Silo + Worker + SSE + Leaderboard flow (`apps/api/tests/postgres.integration.test.ts`, `apps/judge-worker/tests/worker.integration.test.ts`)
- [x] Fix verified Day 8 bugs: user exit `125`/`126`/`127` misclassification (`runner.ts`), async Redis SSE readiness (`sse.ts`), and corrupted/empty worker payload guards (`judgeProcessor.ts`)
- [x] Update `docs/learning-notes.md`, `apps/judge-worker/README.md`, `docs/changelog.md`, and `docs/project-checklist.md`

## Day 9 — Sandbox Security Attack Suite (`SAFE-01` to `SAFE-09`)

- [x] Implement automated live Docker security suite (`apps/judge-worker/tests/safety-suite.integration.test.ts` / `pnpm test:safety`) covering `SAFE-01` through `SAFE-09`
- [x] Separate hostile probe fixtures (`attack-suite/stderr-flood/`, `tmp-escape/`, `env-secret-probe/`) from assertions and update `attack-suite/README.md`
- [x] Harden container sysctl (`net.ipv4.ip_unprivileged_port_start=1024`) and refine `SIGKILL`/`137` vs `TLE`/`OLE`/`MLE` classification (`apps/judge-worker/src/sandbox/runner.ts`)
- [x] Create `docs/test-plan.md` and update `docs/safety.md`, `docs/known-issues.md`, `docs/learning-notes.md`, `README.md`, `docs/changelog.md`, and `docs/project-checklist.md`

## Day 10+ — Upcoming Milestones (Not Started Yet)

- [ ] Build Monaco Editor code submission workflow & live SSE verdict UI in `apps/frontend`
- [ ] Complete remaining contest persistence tables & cron recovery jobs
