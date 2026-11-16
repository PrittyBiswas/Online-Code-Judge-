# Online Code Judge Cron Service (`@judge/cron`)

Standalone Node.js scheduler service for recurring maintenance, recovery, and contest lifecycle jobs.

## Future Responsibilities

1. **Stuck-Job Recovery Sweeper**: Detect submissions stuck in `RUNNING` past the threshold (e.g., if a worker crashed) and re-queue them once before marking `INTERNAL_ERROR`.
2. **Container & Artifact Cleanup**: Remove any orphaned sandbox containers or expired temporary files.
3. **Contest Lifecycle (Tier 2)**: Automatically open/close contests and freeze leaderboards on schedule (`Asia/Kolkata` / IST), guarded by Redis distributed run-claim locks so multiple cron instances never duplicate work.

## Current Responsibilities & Implementation

- **Service Lifecycle**: Structured Pino logging (`judge-cron`), configurable log level (`LOG_LEVEL`), and graceful shutdown handling (`SIGTERM`/`SIGINT`).
- **Periodic Scheduler**: Ticks on configurable background intervals for recurring maintenance jobs.
- **Worker/API Sweep Coordination**: The primary submission recovery sweeper is embedded inside `apps/judge-worker/src/recovery/recoveryService.ts` (running every `RECOVERY_INTERVAL_MS`), and the notification reconciliation sweeper runs in `apps/api/src/modules/notifications/notifications.service.ts` guarded by Redis distributed locks. `apps/cron` serves as a standalone process for decoupled background scheduling.

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm dev:cron
pnpm --filter @judge/cron typecheck
pnpm --filter @judge/cron build
```
