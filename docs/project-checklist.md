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

## Day 6+ — Upcoming Milestones (Not Started Yet)

- [ ] Complete remaining contest persistence tables & Tier-2 features
- [ ] Wire BullMQ submission queue to `apps/judge-worker` Docker sandbox execution
- [ ] Build Monaco Editor code submission workflow in `apps/frontend`
- [ ] End-to-end attack-suite security verification
