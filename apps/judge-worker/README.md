# Online Code Judge Worker (`@judge/worker`)

Host-run background worker responsible for executing untrusted user submissions inside disposable, locked-down Docker containers.

## Why It Runs on the Host (Not in Docker Compose)

Per **Safety Rule 6** (`docs/safety.md`):

- The Docker socket (`/var/run/docker.sock`) must **never** be mounted inside any container. A container with Docker socket access effectively has root access to the host machine.
- Therefore, `@judge/worker` runs directly as a Node.js process on the host OS and spawns throw-away sandbox containers via `child_process.execFile('docker', [...])`.

## Future Responsibilities

1. **Queue Consumption**: Pull submission jobs from BullMQ (`judge-queue`) with controlled concurrency and lock durations.
2. **Test Case Fetching**: Download sample and hidden test inputs/expected outputs from MinIO.
3. **Sandboxed Execution**: Start a fresh container per test case (`--network none`, `--memory=128m`, `--cpus=0.5`, `--pids-limit=64`, `--read-only`, `--cap-drop ALL`, `--user 1000:1000`) with a hard external wall-clock timeout and 64 KB output cap.
4. **Evaluation & Verdicts**: Compare outputs, stop early on failure, persist verdicts idempotently to PostgreSQL, update Redis leaderboards, and publish live SSE events via Redis Pub/Sub.
5. **Graceful Recovery**: Kill active containers and return jobs on `SIGTERM`.

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm dev:worker
pnpm --filter @judge/worker typecheck
pnpm --filter @judge/worker build
```

## Implemented Today (Day 2)

- TypeScript strict configuration, `package.json` with `@judge/shared` workspace dependency, and entry point (`src/index.ts`).
- Pre-existing Week 1 sandbox runner prototype preserved intact.

## Intentionally Postponed

- Live BullMQ worker loop consuming submission jobs from Redis.
- End-to-end MinIO test-case downloading and database persistence.
