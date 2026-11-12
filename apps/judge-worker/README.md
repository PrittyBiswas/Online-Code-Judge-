# Online Code Judge Worker (`@judge/worker`)

Host-run background worker that consumes queued coding submissions from BullMQ (`judge-queue`), fetches test cases from MinIO/Silo, compiles and executes user programs inside disposable locked-down Docker containers, evaluates outputs, and persists final verdicts idempotently to PostgreSQL via Drizzle ORM.

---

## Architecture & Execution Flow

1. **BullMQ Consumer (`src/queue/worker.ts`)**: Connects to Redis (`REDIS_URL`), consumes jobs from `judge-queue` with configurable concurrency (`WORKER_CONCURRENCY`, default `2`), explicit stalled-job monitoring (`WORKER_LOCK_DURATION_MS`, `WORKER_STALLED_INTERVAL_MS`, `WORKER_MAX_STALLED_COUNT`), exponential backoff retries (`WORKER_MAX_ATTEMPTS`), and clean `SIGTERM`/`SIGINT` shutdown (`closeDatabase`, `closeQueue`, container cleanup, sweeper shutdown).
2. **Reliability & Stale Recovery (`src/recovery/recoveryService.ts`, `src/utils/errors.ts`)**:
   - Periodic sweeper runs at startup and on `RECOVERY_INTERVAL_MS` to detect abandoned `RUNNING` submissions whose `updated_at` exceeds `RECOVERY_STALE_MS` (default `120000` ms).
   - Never touches actively running BullMQ jobs (`queue.getJob(id).isActive()`) or recently started `RUNNING` submissions.
   - Uses optimistic compare-and-swap (`WHERE status = 'RUNNING' AND updated_at = expectedUpdatedAt`) so multiple worker instances cannot double-recover or double-claim a submission.
   - Re-enqueues recoverable submissions back into `judge-queue` when `retry_count < WORKER_MAX_ATTEMPTS`, or finalizes exhausted submissions permanently as `INTERNAL_ERROR` and broadcasts the SSE terminal event.
   - Prunes orphaned `judge-sandbox-*` Docker containers not belonging to any active tracked worker execution.
3. **Idempotent Job Processor (`src/processor/judgeProcessor.ts`)**:
   - Validates `submissionId` and rejects permanent data/config failures (`INVALID_JOB_DATA`, `SUBMISSION_NOT_FOUND`, `PROBLEM_NOT_FOUND`, `UNSUPPORTED_LANGUAGE`, `MISSING_TEST_CASES`, `MISSING_TEST_CASE_OBJECT`) via `PermanentWorkerError` (`UnrecoverableError`) without retries.
   - Rejects duplicate Attempt 1 deliveries when status is already `RUNNING` or `COMPLETED`, and acquires execution locks via optimistic CAS (`claimSubmissionRunning`).
   - Loads problem metadata and ordered `test_cases` from PostgreSQL, then fetches input/expected output files from MinIO/Silo using AWS Signature V4 (`src/storage/minio.ts`).
   - Releases `RUNNING -> QUEUED` cleanly on retryable transient failures (`DOCKER_DAEMON_UNAVAILABLE`, `SANDBOX_CONTAINER_START_FAILED`, `OBJECT_STORAGE_TRANSIENT_ERROR`, `DATABASE_TRANSIENT_ERROR`) so retries or recovery can re-claim without waiting for stale expiration.
   - Logs structured observability fields (`submissionId`, `jobId`, `durationMs`, `retryAttempt`, `failureCategory`, `finalVerdict`) without logging source code, hidden tests, or credentials.
4. **Isolated Sandbox Execution (`src/sandbox/runner.ts`, `src/executor/executor.ts`)**:
   - Runs each test case in a fresh disposable container (`--rm`, `--network none`, `--memory`, `--memory-swap`, `--cpus`, `--pids-limit`, `--read-only`, `--tmpfs /tmp:rw,noexec,nosuid,size=16m`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--user 1000:1000`).
   - Sends `{ code, input }` over piped `stdin` (`-i`) — never via host bind mounts or shell strings.
   - Enforces a pre-execution syntax/compilation check (`COMPILATION_ERROR`), compilation wall-clock timeout, external execution timeout (`TIME_LIMIT_EXCEEDED`), cumulative stdout/stderr byte cap (`OUTPUT_LIMIT_EXCEEDED`), OOM detection (`MEMORY_LIMIT_EXCEEDED`), and explicit Docker daemon / container-startup error detection (exit codes `125`/`126`/`127` / daemon offline -> retryable infra failure instead of silent `RUNTIME_ERROR`).
   - Awaits forced container removal (`docker rm -f`) so no stale sandbox containers leak after failure or timeout.
5. **Evaluation & Persistence (`src/evaluator/evaluator.ts`, `src/verdicts/handler.ts`)**:
   - Compares stdout against expected output using `compareOutputs()` (CRLF->LF normalization + trailing whitespace/blank-line trimming).
   - Stops early on the first non-`ACCEPTED` test case and records `failedTestIndex` without exposing hidden test contents.
   - Persists final `status = 'COMPLETED'`, `verdict`, `executionTimeMs`, `memoryUsedKb`, and `failedTestIndex` conditionally (`WHERE status IN ('QUEUED', 'RUNNING')`), then broadcasts the SSE update and updates the global leaderboard on first `ACCEPTED` solve. Database persistence failures propagate and never falsely succeed or broadcast SSE updates.

---

## Supported Languages

| Language     | Docker Image (`env` configurable) | Syntax / Compile Check                  | Execution                  |
| :----------- | :-------------------------------- | :-------------------------------------- | :------------------------- |
| `javascript` | `node:20-alpine`                  | `new Function('require', code)`         | Node.js 20 (`node -e`)     |
| `python`     | `python:3.11-alpine`              | `compile(code, '<submission>', 'exec')` | Python 3 (`python3 -I -c`) |

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
- Worker & sandbox defaults: `WORKER_CONCURRENCY`, `WORKER_LOCK_DURATION_MS`, `WORKER_STALLED_INTERVAL_MS`, `WORKER_MAX_STALLED_COUNT`, `WORKER_MAX_ATTEMPTS`, `RECOVERY_STALE_MS`, `RECOVERY_INTERVAL_MS`, `SANDBOX_TIMEOUT_MS`, `SANDBOX_MEMORY_LIMIT_MB`, `SANDBOX_CPUS`, `SANDBOX_PIDS_LIMIT`, `SANDBOX_OUTPUT_LIMIT_BYTES`, `SANDBOX_DOCKER_IMAGE`, `SANDBOX_PYTHON_IMAGE`

---

## Troubleshooting & Recovery Verification

```powershell
# Check for any leftover sandbox containers
docker ps -a --filter "name=judge-sandbox-"

# Inspect Postgres submission state distribution
docker exec judge_postgres psql -U judge_user -d judge_db -c "SELECT status, verdict, retry_count, count(*) FROM submissions GROUP BY status, verdict, retry_count;"

# Inspect Redis queue & infrastructure health
pnpm infra:verify
```

---

## Verdict Matrix, Edge Cases & Known Limitations

| Scenario                                                  | Verdict / Behavior                                                                    |
| :-------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| All test cases pass (`CRLF`/`LF`, trailing spaces/lines)  | `ACCEPTED`                                                                            |
| Mismatched content, leading/internal spaces, or tabs      | `WRONG_ANSWER` (`failedTestIndex` set; hidden test contents redacted)                 |
| Invalid JS/Python syntax                                  | `COMPILATION_ERROR`                                                                   |
| Exception, `process.exit(127)`, network dial, root FS err | `RUNTIME_ERROR`                                                                       |
| Infinite loop or DNS stall in `--network none`            | `TIME_LIMIT_EXCEEDED`                                                                 |
| Exceeding `--memory` (`137`/`SIGKILL`/`MemoryError`/heap) | `MEMORY_LIMIT_EXCEEDED`                                                               |
| Exceeding `SANDBOX_OUTPUT_LIMIT_BYTES` (default 64 KB)    | `OUTPUT_LIMIT_EXCEEDED`                                                               |
| Unsupported language / empty code / missing test object   | `INTERNAL_ERROR` + `PermanentWorkerError` (no retry)                                  |
| Corrupted/null BullMQ job payload                         | `PermanentWorkerError('INVALID_JOB_DATA')` (no crash, no `RUNNING` lock)              |
| Docker daemon offline / DB transient failure              | Releases `RUNNING -> QUEUED` and throws `RetryableWorkerError` for backoff retry      |

**Known Limitations**:
- In `JS_BOOTSTRAP`, synchronous `fs.readFileSync(0, 'utf8')` buffers `{ code, input }` inside the container and `/tmp` tmpfs is capped at `16m`; multi-megabyte inputs (>16 MB) exceed container scratch limits by design.
- Default `SANDBOX_OUTPUT_LIMIT_BYTES` is `65536` bytes (64 KB) unless configured higher via env (`maxOutputBytes`, up to `1048576` in `.env` / `env.ts`).
- `http.get('http://google.com')` with DNS resolution inside `--network none` may stall until `timeLimitMs` (`TIME_LIMIT_EXCEEDED`), whereas direct IP sockets (`net.connect(80, '1.1.1.1')`) fail immediately (`RUNTIME_ERROR`); both completely prevent network access.

---

## Verdict Matrix, Edge Cases & Known Limitations

| Scenario                                                  | Verdict / Behavior                                                               |
| :-------------------------------------------------------- | :------------------------------------------------------------------------------- |
| All test cases pass (`CRLF`/`LF`, trailing spaces/lines)  | `ACCEPTED`                                                                       |
| Mismatched content, leading/internal spaces, or tabs      | `WRONG_ANSWER` (`failedTestIndex` set; hidden test contents redacted)            |
| Invalid JS/Python syntax                                  | `COMPILATION_ERROR`                                                              |
| Exception, `process.exit(127)`, network dial, root FS err | `RUNTIME_ERROR`                                                                  |
| Infinite loop or DNS stall in `--network none`            | `TIME_LIMIT_EXCEEDED`                                                            |
| Exceeding `--memory` (`137`/`SIGKILL`/`MemoryError`/heap) | `MEMORY_LIMIT_EXCEEDED`                                                          |
| Exceeding `SANDBOX_OUTPUT_LIMIT_BYTES` (default 64 KB)    | `OUTPUT_LIMIT_EXCEEDED`                                                          |
| Unsupported language / empty code / missing test object   | `INTERNAL_ERROR` + `PermanentWorkerError` (no retry)                             |
| Corrupted/null BullMQ job payload                         | `PermanentWorkerError('INVALID_JOB_DATA')` (no crash, no `RUNNING` lock)         |
| Docker daemon offline / DB transient failure              | Releases `RUNNING -> QUEUED` and throws `RetryableWorkerError` for backoff retry |

**Known Limitations**:

- In `JS_BOOTSTRAP`, synchronous `fs.readFileSync(0, 'utf8')` buffers `{ code, input }` inside the container and `/tmp` tmpfs is capped at `16m`; multi-megabyte inputs (>16 MB) exceed container scratch limits by design.
- Default `SANDBOX_OUTPUT_LIMIT_BYTES` is `65536` bytes (64 KB) unless configured higher via env (`maxOutputBytes`, up to `1048576` in `.env` / `env.ts`).
- `http.get('http://google.com')` with DNS resolution inside `--network none` may stall until `timeLimitMs` (`TIME_LIMIT_EXCEEDED`), whereas direct IP sockets (`net.connect(80, '1.1.1.1')`) fail immediately (`RUNTIME_ERROR`); both completely prevent network access.

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
