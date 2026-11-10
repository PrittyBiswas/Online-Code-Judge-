# Changelog

All notable changes to the Online Code Judge project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
