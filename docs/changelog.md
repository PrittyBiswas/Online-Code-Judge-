# Changelog

All notable changes to the Online Code Judge project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-11-07

### Added
- **Monorepo Structure**: Initialized TypeScript workspaces with `apps/api`, `apps/judge-worker`, `apps/cron`, `apps/stub-mail`, `apps/frontend`, and `packages/shared`.
- **Infrastructure**: Defined `docker-compose.yml` for PostgreSQL 16, Redis 7, and MinIO with automated bucket creation.
- **Safety Engine**: Created `apps/judge-worker/src/sandbox/runner.ts` implementing all 10 non-negotiable container lockdown rules via `child_process.execFile`.
- **Documentation**: Established `/docs` with `safety.md`, `learning-notes.md`, `changelog.md`, and `known-issues.md`.

