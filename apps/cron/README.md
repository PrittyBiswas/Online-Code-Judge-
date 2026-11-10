# Online Code Judge Cron Service (`@judge/cron`)

Standalone Node.js scheduler service for recurring maintenance, recovery, and contest lifecycle jobs.

## Future Responsibilities

1. **Stuck-Job Recovery Sweeper**: Detect submissions stuck in `RUNNING` past the threshold (e.g., if a worker crashed) and re-queue them once before marking `INTERNAL_ERROR`.
2. **Container & Artifact Cleanup**: Remove any orphaned sandbox containers or expired temporary files.
3. **Contest Lifecycle (Tier 2)**: Automatically open/close contests and freeze leaderboards on schedule (`Asia/Kolkata` / IST), guarded by Redis distributed run-claim locks so multiple cron instances never duplicate work.

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm dev:cron
pnpm --filter @judge/cron typecheck
pnpm --filter @judge/cron build
```

## Implemented Today (Day 2)

- TypeScript strict workspace configuration, `package.json` with `@judge/shared`, and entry point (`src/index.ts`).

## Intentionally Postponed

- BullMQ repeat schedulers, Redis run-claim locks, stuck-job recovery, and cleanup jobs.
