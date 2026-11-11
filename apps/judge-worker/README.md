# Online Code Judge Worker (`@judge/worker`)

Host-run background worker that consumes queued coding submissions from BullMQ (`judge-queue`), fetches test cases from MinIO/Silo, compiles and executes user programs inside disposable locked-down Docker containers, evaluates outputs, and persists final verdicts idempotently to PostgreSQL via Drizzle ORM.

---

## Architecture & Execution Flow

1. **BullMQ Consumer (`src/queue/worker.ts`)**: Connects to Redis (`REDIS_URL`), consumes jobs from `judge-queue` with configurable concurrency (`WORKER_CONCURRENCY`, default `2`), exponential backoff retries, and clean `SIGTERM`/`SIGINT` shutdown.
2. **Idempotent Job Processor (`src/processor/judgeProcessor.ts`)**:
   - Validates `submissionId` (rejects malformed/missing IDs with `UnrecoverableError`).
   - Skips already-`COMPLETED` submissions to prevent duplicate processing.
   - Atomically transitions `QUEUED -> RUNNING`, increments `retry_count`, and publishes a `RUNNING` SSE event.
   - Loads problem metadata and ordered `test_cases` from PostgreSQL, then fetches input/expected output files from MinIO/Silo using AWS Signature V4 (`src/storage/minio.ts`).
3. **Isolated Sandbox Execution (`src/sandbox/runner.ts`, `src/executor/executor.ts`)**:
   - Runs each test case in a fresh disposable container (`--rm`, `--network none`, `--memory`, `--memory-swap`, `--cpus`, `--pids-limit`, `--read-only`, `--tmpfs /tmp:rw,noexec,nosuid,size=16m`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--user 1000:1000`).
   - Sends `{ code, input }` over piped `stdin` (`-i`) — never via host bind mounts or shell strings.
   - Enforces a pre-execution syntax/compilation check (`COMPILATION_ERROR`), external host wall-clock timeout (`TIME_LIMIT_EXCEEDED`), cumulative stdout/stderr byte cap (`OUTPUT_LIMIT_EXCEEDED`), and OOM detection (`MEMORY_LIMIT_EXCEEDED`), while recording execution time and peak memory usage (`memoryUsedKb`).
   - Awaits forced container removal (`docker rm -f`) so no stale sandbox containers leak after failure or timeout.
4. **Evaluation & Persistence (`src/evaluator/evaluator.ts`, `src/verdicts/handler.ts`)**:
   - Compares stdout against expected output using `compareOutputs()` (CRLF->LF normalization + trailing whitespace/blank-line trimming).
   - Stops early on the first non-`ACCEPTED` test case and records `failedTestIndex` without exposing hidden test contents.
   - Persists final `status = 'COMPLETED'`, `verdict`, `executionTimeMs`, `memoryUsedKb`, and `failedTestIndex` conditionally (`WHERE status IN ('QUEUED', 'RUNNING')`), then broadcasts the SSE update and updates the global leaderboard on first `ACCEPTED` solve.

---

## Supported Languages

| Language     | Docker Image (`env` configurable) | Syntax / Compile Check                        | Execution                     |
| :----------- | :-------------------------------- | :-------------------------------------------- | :---------------------------- |
| `javascript` | `node:20-alpine`                  | `new Function('require', code)`               | Node.js 20 (`node -e`)        |
| `python`     | `python:3.11-alpine`              | `compile(code, '<submission>', 'exec')`       | Python 3 (`python3 -I -c`)    |

---

## Security & Docker Isolation Limitations

- **Why the worker runs on the host (Safety Rule 6, [`docs/safety.md`](../../docs/safety.md))**: `/var/run/docker.sock` is **never** mounted into the API or any Compose service. The worker runs on the host OS and spawns throw-away containers via `child_process.execFile('docker', args)` (no shell interpolation).
- **Docker Daemon Trust Boundary**: Because the worker process invokes the host `docker` CLI, the worker host OS account itself has Docker daemon access (`root`-equivalent capability to spawn containers). Keep the worker isolated from untrusted inputs outside container boundaries, run container workloads strictly with `--user 1000:1000`, `--network none`, `--cap-drop ALL`, and never run `judge-worker` in a multi-tenant untrusted container with a mounted socket.
- **Image Prerequisite**: Ensure sandbox base images (`node:20-alpine`, `python:3.11-alpine`) are pulled locally before running submissions (`docker pull node:20-alpine`, `docker pull python:3.11-alpine`).

---

## Required Environment Variables

Uses root `.env` (see [`.env.example`](../../.env.example)):

- `DATABASE_URL` (or `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`)
- `REDIS_URL` (or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`)
- `MINIO_ENDPOINT`, `MINIO_PORT` / `MINIO_API_PORT`, `MINIO_ROOT_USER` / `MINIO_ACCESS_KEY`, `MINIO_ROOT_PASSWORD` / `MINIO_SECRET_KEY`, `MINIO_BUCKET_NAME`
- Worker & sandbox defaults: `WORKER_CONCURRENCY`, `SANDBOX_TIMEOUT_MS`, `SANDBOX_MEMORY_LIMIT_MB`, `SANDBOX_CPUS`, `SANDBOX_PIDS_LIMIT`, `SANDBOX_OUTPUT_LIMIT_BYTES`, `SANDBOX_DOCKER_IMAGE`, `SANDBOX_PYTHON_IMAGE`

---

## Commands (Windows PowerShell)

From the monorepo root:

```powershell
# Start the host worker in watch mode (requires Docker, Postgres, Redis, MinIO running)
pnpm dev:worker

# Build and start compiled worker
pnpm --filter @judge/worker build
pnpm --filter @judge/worker start

# Typecheck and tests
pnpm --filter @judge/worker typecheck
pnpm --filter @judge/worker test              # Offline unit tests
pnpm --filter @judge/worker test:integration  # Live Docker + BullMQ + Postgres + Silo tests
pnpm --filter @judge/worker test:sandbox      # Attack-suite verification script
```

