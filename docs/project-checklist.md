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

## Day 10 — Authentication Backend & RBAC Hardening

- [x] Enforce server-side `Role.USER` assignment, email normalization, strong password policy (`min(8)`), and `bcrypt` hashing (`registerSchema`, `authService.register`)
- [x] Deliver JWT strictly in `HttpOnly` cookie (`SameSite=Lax`, `Path=/`, `secure` in production) and omit JWT from JSON responses
- [x] Require `JWT_SECRET` in production and wire `JWT_EXPIRES_IN` + `AUTH_COOKIE_NAME` in `apps/api/src/config/env.ts` and `.env.example`
- [x] Harden `requireAuth` to verify cookie JWT + active PostgreSQL user/role, protect `GET /api/auth/me`, and match cookie clearing options in `POST /api/auth/logout`
- [x] Add comprehensive Vitest unit/HTTP & PostgreSQL integration tests for registration, login, cookies, middleware, RBAC, logout, and `/me`
- [x] Update `.env.example`, `apps/api/README.md`, `docs/safety.md`, `docs/changelog.md`, `docs/learning-notes.md`, and `docs/project-checklist.md`

## Day 11 — Redis Login Protection & Authentication Frontend

- [x] Verify Redis login lockout (`INCR`/`EXPIRE`/lockout TTL), failure reset on login, and fail-open behavior (`apps/api/tests/redis-lockout.test.ts`)
- [x] Implement frontend auth API integration (`src/services/authApi.ts`, `apiClient.ts` `withCredentials` & `401` interceptor)
- [x] Implement `AuthProvider` (`src/context/AuthContext.tsx`), `ProtectedRoute.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `DashboardPage.tsx`, and `Header.tsx` logout/cache cleanup
- [x] Add frontend Vitest + jsdom + React Testing Library suite (`apps/frontend/tests/auth.test.tsx`)
- [x] Update `apps/frontend/README.md`, `docs/safety.md`, `docs/learning-notes.md`, `docs/changelog.md`, and `docs/project-checklist.md`

## Day 12 — Problem Management, Search, MinIO Storage & Redis Caching

- [x] Add GIN full-text search index migration (`drizzle/migrations/0001_tan_hairball.sql`) on `problems` (`title`, `statement`)
- [x] Implement parameterized PostgreSQL FTS (`websearch_to_tsquery`, `ts_rank`), strict AND filtering (`difficulty`, `tag`, `category`, `search`), and validated `base64url` keyset cursor pagination (`problems.service.ts`, `problem.schema.ts`)
- [x] Add `DELETE /api/problems/:id` with RBAC (`PROBLEM_SETTER`/`ADMIN`), submission-reference archival safety, and post-DB MinIO cleanup (`problems.routes.ts`, `problems.controller.ts`, `minio.ts`)
- [x] Implement versioned Redis cache-aside (`getProblem` + `listProblems`), corrupt-JSON recovery, PostgreSQL fallback, and `INCR`-based invalidation (`problems.service.ts`, `REDIS_KEYS`)
- [x] Expand unit tests (`apps/api/tests/problems.test.ts`) and add live PostgreSQL + Redis + MinIO integration suite (`apps/api/tests/problems.integration.test.ts`)
- [x] Update `apps/api/README.md`, `docs/safety.md`, `docs/learning-notes.md`, `docs/changelog.md`, `docs/project-checklist.md`, and `docs/known-issues.md`

## Day 13 — Frontend Problem List & Problem Details

- [x] Add `problemsApi.ts` (`fetchProblems`, `fetchProblemById` with `AbortSignal`), `useDebouncedValue.ts` (`300ms`), `DifficultyBadge.tsx`, and shared type exports in `apps/frontend/src/types/index.ts`
- [x] Implement public `/problems` (`ProblemsPage.tsx`) with debounced search, `difficulty` + `tag` AND-filtering, cursor-based Previous/Next pagination, cursor reset on filter change, and loading/empty/error states
- [x] Implement public `/problems/:id` (`ProblemDetailPage.tsx`) supporting UUID/slug, safe plain-text rendering, sample I/O blocks, `404` not-found state, and error retry
- [x] Wire `/problems` and `/problems/:id` routes (`App.tsx`), header link (`Header.tsx`), and home CTA (`HomePage.tsx`) without altering auth/protected routes
- [x] Add frontend problem tests (`apps/frontend/tests/problems.test.tsx`) and update `apps/frontend/README.md`, `docs/changelog.md`, `docs/learning-notes.md`, and `docs/project-checklist.md`

## Day 14 — API Client Reliability, Code Editor & Sample Execution

- [x] Enhance `apps/frontend/src/services/apiClient.ts` with `classifyApiError()`, single-event `401` deduplication, `403` separation, and `AbortSignal`-aware `getWithRetry()`
- [x] Implement dedicated `sample-run-queue` + strict `runSampleSchema` + `POST /api/submissions/run-sample` (`202`) + `GET /api/submissions/run-sample/:runId` ownership-protected polling (`300s` Redis TTL)
- [x] Add `sampleRunProcessor.ts` and `sampleWorker` in `apps/judge-worker` reusing `runInSandbox()` Docker lockdown without touching `submissions`, `test_cases`, MinIO, or `leaderboard`
- [x] Integrate `@monaco-editor/react` (`CodeEditor.tsx`) and `SampleRunnerPanel.tsx` into `ProblemDetailPage.tsx` for JavaScript & Python with language draft preservation, reset confirmation, and safe text output rendering
- [x] Add frontend, backend, worker unit tests, and live Docker `sample-run.integration.test.ts`; update documentation

## Day 15 — Official Submission & Asynchronous Judging Workflow

- [x] Harden `POST /api/submissions` with queue-failure DB compensation (`503` + row deletion) and enforce `403` ownership on `GET /api/submissions/:id` (`apps/api/src/modules/submissions/submissions.service.ts`)
- [x] Verify `judge-queue` host worker (`judgeProcessor.ts`) atomically claims submissions, loads all MinIO/Silo test cases, stops early on failure, and persists official verdicts idempotently
- [x] Integrate official **Submit** action and bounded `AbortController` polling (`QUEUED -> RUNNING -> Verdict`) into `SampleRunnerPanel.tsx` & `submissionsApi.ts` while keeping **Run Sample** independent
- [x] Expand backend (`apps/api/tests/submissions.test.ts`) and frontend (`apps/frontend/tests/sample-runner.test.tsx`) tests and update Day 15 documentation

## Day 16 — Real-Time Submission Updates via Server-Sent Events (SSE)

- [x] Secure `GET /api/submissions/:id/live` with `requireAuth` (`HttpOnly` cookie), `404`/`403` ownership checks, pre-snapshot event buffering, monotonic status guards, payload sanitization, and Redis disconnect cleanup (`apps/api/src/events/sse.ts`)
- [x] Integrate `EventSource` (`withCredentials: true`) + connection status indicators + bounded polling fallback into `SampleRunnerPanel.tsx` and `submissionsApi.ts`
- [x] Add backend SSE unit/race tests (`apps/api/tests/sse.test.ts`), expand frontend SSE/fallback tests (`apps/frontend/tests/sample-runner.test.tsx`), and update Day 16 documentation

## Day 17+ — Upcoming Milestones (Not Started Yet)

- [ ] Build Monaco Editor code submission workflow & live SSE verdict UI in `apps/frontend`
- [ ] Complete remaining contest persistence tables & cron recovery jobs
