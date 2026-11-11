# Changelog

All notable changes to the Online Code Judge project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
