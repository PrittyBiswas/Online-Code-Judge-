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

## Day 3+ — Upcoming Milestones (Not Started Yet)

- [ ] Start and verify PostgreSQL, Redis, and MinIO runtime integration + Drizzle migrations
- [ ] Complete end-to-end API routes with real database persistence
- [ ] Wire BullMQ submission queue to `apps/judge-worker` Docker sandbox execution
- [ ] Build Monaco Editor code submission workflow in `apps/frontend`
- [ ] End-to-end attack-suite security verification
