# Changelog

All notable changes to the Online Code Judge project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Day 10 (2026-11-12)

### Changed & Hardened

- **Authentication & Registration (`packages/shared/src/schemas/auth.schema.ts`, `apps/api/src/modules/auth/`)**:
  - Removed client-supplied `role` from `registerSchema` and enforced `Role.USER` on the server in `authService.register()`.
  - Normalized emails (`trim().toLowerCase()`), enforced minimum 8-character passwords, and used `bcrypt` (`12` rounds in dev/prod, `10` in test).
  - Removed `token` from `POST /api/auth/register` and `POST /api/auth/login` JSON response bodies; JWT is now delivered strictly in an `HttpOnly` cookie (`SameSite=Lax`, `Path=/`, `secure` in production).
  - Updated `POST /api/auth/logout` to clear the cookie using matching `httpOnly`, `secure`, `sameSite`, and `path` options.
  - Protected `GET /api/auth/me` with `requireAuth` (`401 Unauthorized` when unauthenticated).
- **Cookie-Only DB-Validated Auth Middleware (`apps/api/src/middleware/auth.ts`, `apps/api/src/config/env.ts`)**:
  - Verified HTTP-only cookie JWTs (`JWT_EXPIRES_IN`), queried PostgreSQL `users` table on every authenticated request so deleted users are rejected (`401`) and `req.user.role` always comes from server-side DB state, and required `JWT_SECRET` in production.
- **Auth & Integration Tests (`apps/api/tests/auth.test.ts`, `apps/api/tests/postgres.integration.test.ts`)**: Expanded full HTTP tests for registration, login, cookie attributes, middleware (`401`), RBAC (`403`), logout, `/me`, and real PostgreSQL integration.

## [Unreleased] - Day 9 (2026-11-12)

### Added

- **Automated Sandbox Security Attack Suite (`apps/judge-worker/tests/safety-suite.integration.test.ts`, `pnpm test:safety`)**: Implemented live Docker verification for `SAFE-01` through `SAFE-09` covering infinite loops (JS/Python TLE), memory exhaustion (JS/Python MLE), fork bombs (`--pids-limit`), network isolation (`--network none` DNS/HTTP/IP/local ports), filesystem isolation (host marker non-visibility, read-only `/`, `/tmp` `noexec` & 16 MB cap), stdout & stderr floods (`OUTPUT_LIMIT_EXCEEDED`), privilege escalation (`UID/GID 1000`, `CapEff: 0`, `NoNewPrivs: 1`, port 80 `EACCES`), cross-run `/tmp` & container cleanup, and live `docker inspect` + `docker-compose.yml` + env-secret boundary checks.
- **Standalone Attack Fixtures (`attack-suite/stderr-flood/`, `tmp-escape/`, `env-secret-probe/`)**: Separated hostile probe code from test assertions and updated `attack-suite/README.md`.
- **Security & Test Documentation**: Created `docs/test-plan.md` and updated `docs/safety.md`, `docs/known-issues.md`, `docs/learning-notes.md`, `README.md`, `docs/changelog.md`, and `docs/project-checklist.md`.

### Changed

- **Sandbox Port Hardening & Exit-137 Classification (`apps/judge-worker/src/sandbox/runner.ts`, `src/sandbox/demo.ts`)**: Added `--sysctl net.ipv4.ip_unprivileged_port_start=1024` so privileged port binds fail with `EACCES` even on WSL2 Docker Desktop, tracked `execFileTimedOut` and `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`, and guarded against blindly classifying non-OOM `SIGKILL`/exit `137` as `MEMORY_LIMIT_EXCEEDED`.

## [Unreleased] - Day 8 (2026-11-12)

### Added

- **Comprehensive Judge Edge-Case & E2E Test Coverage (`packages/shared/tests/`, `apps/api/tests/postgres.integration.test.ts`, `apps/judge-worker/tests/`)**:
  - Output comparator & Zod schema edge cases (CRLF/LF, trailing vs leading/internal tabs & spaces, Unicode, empty/null inputs, 8000-line large outputs, empty code/unsupported language/missing `problemId` validation).
  - Judge worker unit tests covering hidden-test redaction, 25-test collection metric aggregation, null/corrupted payloads, empty source code, unsupported languages, archived problems, and exit code `125`/`126`/`127` classification.
  - Live integration & security isolation tests exercising JS & Python empty/Unicode/CRLF/120 KB I/O, immediate exit, `process.exit(127)`, Python RE/TLE, live `attack-suite` (`network-attempt`, direct TCP dial, `file-access`, `fork-bomb`, `privilege-check`), HTTP malformed requests -> 400, SSE `/api/submissions/:id/live`, Redis Pub/Sub events, and idempotent leaderboard scoring.
- **Documentation Updates**: Updated `docs/learning-notes.md`, `apps/judge-worker/README.md`, `docs/changelog.md`, and `docs/project-checklist.md`.

### Fixed

- **Sandbox User Exit Code 125/126/127 Disambiguation (`apps/judge-worker/src/sandbox/runner.ts`)**: Checked runtime bootstrap markers (`__JUDGE_MEMORY_KB:` / `__JUDGE_COMPILE_ERROR__`) before treating exit codes `125`/`126`/`127` as `SANDBOX_CONTAINER_START_FAILED`, ensuring `process.exit(127)` / `sys.exit(125)` returns `RUNTIME_ERROR`.
- **Async Redis SSE Subscription (`apps/api/src/events/sse.ts`)**: Attached `redisSubscriber.on('ready', ...)` listener in `SSEManager` so SSE live streams always subscribe even when Redis connects asynchronously after module startup.
- **Worker Malformed Payload Guards & Terminal SSE Publishing (`apps/judge-worker/src/processor/judgeProcessor.ts`)**: Safely handled null/corrupted `jobData`, empty/whitespace source code, and unified permanent failure finalization (`INTERNAL_ERROR` DB save + SSE broadcast).
- **Leaderboard Score Encoding & Uninitialized Decode (`packages/shared/src/utils/score.ts`)**: Returned `{ problemsSolved: 0, totalPenaltySeconds: 0 }` for `score <= 0` and encoded remainder with `MAX_PENALTY = PENALTY_OFFSET - 1` so first solves and zero-second solves never overflow `problemsSolved` or inflate penalty to `9,999,999`.

## [Unreleased] - Day 7 (2026-11-11)

### Added

- **Stale `RUNNING` Recovery & Orphan Pruning (`apps/judge-worker/src/recovery/recoveryService.ts`, `shutdown.ts`)**: Added `SubmissionRecoveryService` sweeper that skips active BullMQ jobs and fresh `RUNNING` submissions, uses optimistic CAS (`WHERE status = 'RUNNING' AND updated_at = ...`) to safely re-enqueue stale rows up to `WORKER_MAX_ATTEMPTS`, finalizes exhausted rows as `INTERNAL_ERROR` with SSE events, and prunes orphaned `judge-sandbox-*` containers.
- **Error Classification & Reliability Config (`apps/judge-worker/src/utils/errors.ts`, `src/config/env.ts`)**: Added `PermanentWorkerError` (`UnrecoverableError`) vs `RetryableWorkerError`, `classifyWorkerError()`, and BullMQ lock/stalled/recovery settings (`WORKER_LOCK_DURATION_MS`, `WORKER_STALLED_INTERVAL_MS`, `WORKER_MAX_STALLED_COUNT`, `WORKER_MAX_ATTEMPTS`, `RECOVERY_STALE_MS`, `RECOVERY_INTERVAL_MS`).
- **Day 7 Reliability Unit & Integration Tests (`apps/judge-worker/tests/`)**: Added unit tests for recovery sweeps, duplicate attempt-1 claim rejection, CAS race skips, error classification, DB failure non-masking, and live Docker/Postgres/BullMQ integration tests for output/memory limits, concurrent claim safety, and stale `RUNNING` recovery.

### Changed

- **Atomic Submission Claiming & Failure Release (`apps/judge-worker/src/processor/judgeProcessor.ts`, `src/queue/worker.ts`)**: Replaced loose claiming with optimistic CAS (`expectedStatus`, `expectedUpdatedAt`), duplicate Attempt 1 `RUNNING` rejection, `releaseSubmissionToQueued()` on retryable infra/DB errors, BullMQ stalled-job logging, and structured observability logs (`submissionId`, `jobId`, `durationMs`, `retryAttempt`, `failureCategory`, `finalVerdict`).
- **Sandbox Infra Error Separation (`apps/judge-worker/src/sandbox/runner.ts`, `src/executor/executor.ts`, `src/evaluator/evaluator.ts`)**: Distinguished Docker daemon unavailable and container startup errors (`125`/`126`/`127`) as retryable infra failures (`infraFailureCategory`) instead of falsely reporting `RUNTIME_ERROR`.

## [Unreleased] - Day 6 (2026-11-11)

### Added

- **BullMQ Judge Worker (`apps/judge-worker/src/queue/worker.ts`, `src/processor/judgeProcessor.ts`)**: Implemented live BullMQ consumer on `judge-queue` with Drizzle ORM PostgreSQL connection (`src/db/`), idempotent `QUEUED -> RUNNING -> COMPLETED` transitions, missing-record/object handling (`UnrecoverableError`), SSE Redis Pub/Sub events, leaderboard updates, and graceful container cleanup on shutdown.
- **MinIO/Silo S3 Signature V4 Storage (`apps/judge-worker/src/storage/minio.ts`, `apps/api/src/config/minio.ts`)**: Signed S3 PUT/GET/DELETE requests with AWS Signature V4 using configured credentials so uploaded test cases persist in `judge-testcases` and download reliably inside the worker.
- **Worker Unit & Live Docker Integration Tests (`apps/judge-worker/tests/`)**: Added mocked processor/flag/retry/error tests (`worker-unit.test.ts`) and live JavaScript/Python sandbox + BullMQ + PostgreSQL + Silo integration tests (`worker.integration.test.ts`).

### Changed

- **Hardened Sandbox Runner (`apps/judge-worker/src/sandbox/runner.ts`)**: Added Python (`python:3.11-alpine`) support alongside Node 20 (`node:20-alpine`), piped `{ code, input }` via stdin instead of large CLI strings, enforced stdout+stderr caps, added compilation/syntax pre-checks (`COMPILATION_ERROR`), tracked peak container memory (`memoryUsedKb`), and awaited `docker rm -f` cleanup before resolving.

## [Unreleased] - Day 5 (2026-11-11)

### Added

- **PostgreSQL Error Mapping & UUID Validation (`apps/api/src/utils/db-error.ts`)**: Added safe translation of PostgreSQL errors (`23505` unique violation, `23503` FK violation, `22P02` invalid syntax, connection errors) to clean `AppError` responses and `isUuid()` checks.
- **Live PostgreSQL Integration Suite (`apps/api/tests/postgres.integration.test.ts` & `pnpm test:integration`)**: Added end-to-end integration tests against live PostgreSQL covering Users CRUD, Problems CRUD + transaction rollback, Submissions CRUD + status/metrics updates + HTTP API compatibility, with isolated cleanup.

### Changed

- **Migrated Services from `memoryDb` to Drizzle ORM**: Migrated `authService`, `usersService`, `problemsService` (transactional problem + test case creation, ID/slug lookup, filtering/search/cursor pagination, deletion), `submissionsService` (creation, retrieval, user/problem listing, status/verdict/runtime metrics updates), `adminService`, `leaderboardService`, `sse.ts`, and `contestsService` user/submission reads to parameterized PostgreSQL queries via Drizzle ORM.
- **Unit Test Isolation**: Updated `auth.test.ts`, `problems.test.ts`, and `submissions.test.ts` to mock `src/db/index.js` using in-memory fixtures so unit tests remain fast and offline while integration tests exercise real PostgreSQL.

## [Unreleased] - Day 4 (2026-11-11)

### Added

- **Drizzle ORM & PostgreSQL Integration (`apps/api/src/db/`)**: Added `drizzle-orm`, `pg`, `@types/pg`, and `drizzle-kit` in `@judge/api`; configured `pg.Pool` connection (`apps/api/src/db/index.ts`) and `apps/api/drizzle.config.ts`.
- **Initial Core Schema (`apps/api/src/db/schema.ts`)**: Defined PostgreSQL tables (`users`, `problems`, `test_cases`, `submissions`), primary keys, foreign keys (`ON DELETE RESTRICT` / `ON DELETE CASCADE`), unique constraints, timestamps, relations, and B-tree indexes.
- **Database Migrations & Verification (`drizzle/migrations/`, `apps/api/src/db/verify.ts`)**: Generated and applied initial migration `0000_new_millenium_guard.sql`, archived Day 1 hand-written SQL draft to `drizzle/reference/0000_initial_schema.sql`, wired `isDatabaseHealthy()` and graceful `closeDatabase()` shutdown, and added `db:generate`, `db:migrate`, `db:studio`, and `db:verify` scripts plus `apps/api/tests/db-schema.test.ts`.
- **Documentation**: Updated `docs/learning-notes.md` with beginner-friendly explanations of Drizzle ORM, ORMs, schemas, migrations, foreign keys, and indexes; updated `README.md`, `apps/api/README.md`, and `docs/project-checklist.md`.

## [Unreleased] - Day 3 (2026-11-10)

### Added

- **Local Infrastructure Guide (`docs/infrastructure.md`)**: Documented Docker Compose architecture, PostgreSQL/Redis/MinIO configuration, named volumes, health checks, start/stop/restart commands, and troubleshooting.
- **Connectivity Verification (`scripts/verify-infrastructure.ts` & `pnpm infra:verify`)**: Added real TCP, Redis RESP `PING`, MinIO HTTP API/Console, PostgreSQL `pg_isready`/`psql`, and named-volume verification checks.
- **Infrastructure Config Tests (`apps/api/tests/infrastructure-config.test.ts`)**: Added Vitest verification for `127.0.0.1` localhost bindings, named volumes, health checks, worker/socket exclusion, and `REDIS_URL` connection parsing.

### Changed

- **Hardened `docker-compose.yml`**: Bound PostgreSQL, Redis, and MinIO ports strictly to `127.0.0.1`; updated MinIO healthcheck to `mc ready local`; enabled Redis `--appendonly yes` persistence; removed obsolete `version` key; supported `MINIO_API_PORT` while preserving existing variables and idempotent `create-buckets` (`minio/mc`).
- **Environment & API Wiring**: Added `MINIO_API_PORT` to `.env.example`, `apps/api/src/config/env.ts`, and `scripts/verify-environment.ts`; wired `env.REDIS_URL` into `apps/api/src/config/queue.ts`.

## [Unreleased] - Day 2 (2026-11-10)

### Added

- **pnpm Workspace & Root Config**: Added `.npmrc`, `.editorconfig`, root `package.json` (`pnpm@12.18.0`, Node `>=20.0.0` engines, workspace scripts), React ESLint rules (`eslint.config.js`), and expanded `.env.example` (`API_PORT`, `WEB_PORT`, `REDIS_URL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `COOKIE_SECRET`).
- **Shared Package (`packages/shared`)**: Added `APP_INFO`, `HealthStatusResponse`, and `RootApiInfo`, updated `dist/*` exports, and configured `workspace:*` consumption from `apps/api` and `apps/frontend`.
- **API Foundation (`apps/api`)**: Added `GET /` and typed `GET /health/live` endpoints using `@judge/shared`, created `apps/api/src/types/` (`db.ts`, `index.ts`), updated Zod env parsing (`API_PORT` + `COOKIE_SECRET` + root `.env` lookup), and added Vitest smoke tests in `apps/api/tests/health.test.ts`.
- **Frontend Foundation (`apps/frontend`)**: Configured Tailwind CSS + PostCSS + Vite `/api` & `/health` proxy, responsive `MainLayout` + `Header` + `HomePage` importing `APP_INFO` and `HealthStatusResponse` from `@judge/shared`, and API health check hook (`useHealthCheck`).
- **Documentation & Tracking**: Added per-app/package README files across root, `apps/api`, `apps/frontend`, `apps/judge-worker`, `apps/cron`, `apps/stub-mail`, and `packages/shared`, plus `docs/project-checklist.md`.

### Changed

- **Process Isolation Fix**: Removed direct cross-app relative imports from `apps/api` into `apps/judge-worker` and `drizzle/schema.ts` to preserve TypeScript `rootDir` boundaries and host-sandbox isolation.
- **TypeScript Strict Fixes**: Switched root `typecheck` to `pnpm -r typecheck` so Node backend packages and browser React frontend validate against their respective `tsconfig.json` environments cleanly.

## [Unreleased] - 2026-11-07

### Added

- **Monorepo Structure**: Initialized TypeScript workspaces with `apps/api`, `apps/judge-worker`, `apps/cron`, `apps/stub-mail`, `apps/frontend`, and `packages/shared`.
- **Infrastructure**: Defined `docker-compose.yml` for PostgreSQL 16, Redis 7, and MinIO with automated bucket creation.
- **Safety Engine**: Created `apps/judge-worker/src/sandbox/runner.ts` implementing all 10 non-negotiable container lockdown rules via `child_process.execFile`.
- **Documentation**: Established `/docs` with `safety.md`, `learning-notes.md`, `changelog.md`, and `known-issues.md`.
