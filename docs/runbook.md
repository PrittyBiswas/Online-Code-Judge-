# Online Code Judge — Operational Runbook

This document provides step-by-step operational procedures for running, monitoring, diagnosing, and maintaining the Online Code Judge system in development and production environments.

---

## 1. Starting Infrastructure

### Development Infrastructure (Docker Compose)

Starts PostgreSQL, Redis, MinIO, and the automatic bucket creation job bound to `127.0.0.1`:

```powershell
# Start services in detached mode
docker compose up -d

# Verify container statuses
docker compose ps
```

### Production Infrastructure (Production Stack)

```powershell
docker compose -f docker-compose.prod.yml up -d
```

---

## 2. Infrastructure Verification

### 2.1 Automated Health Verification

Run the consolidated infrastructure verification script:

```powershell
# Set port if Postgres runs on 5433 (default in local compose)
$env:POSTGRES_PORT="5433"
pnpm infra:verify
```

### 2.2 Database (PostgreSQL) Verification

```powershell
# Run live schema and read/write check via Drizzle
pnpm db:verify

# Direct container check
docker exec -it judge_postgres pg_isready -U judge_user -d judge_db
```

### 2.3 Redis Verification

```powershell
# Direct container ping
docker exec -it judge_redis redis-cli ping
# Expected response: PONG

# Inspect BullMQ active queues
docker exec -it judge_redis redis-cli keys "bull:*"
```

### 2.4 Object Storage (MinIO) Verification

```powershell
# Check MinIO API readiness
curl -I http://127.0.0.1:9000/minio/health/ready
# Expected response: HTTP/1.1 200 OK

# Check bucket existence using mc inside container
docker exec -it judge_minio_init mc ls local/judge-testcases
```

---

## 3. Starting Application Services

### 3.1 Applying Database Migrations

Before starting API or worker instances on a fresh database:

```powershell
pnpm db:migrate
```

### 3.2 Starting Backend API (`@judge/api`)

```powershell
# Development mode (with live reload)
pnpm dev:api
# API starts on http://localhost:4000

# Verify liveness & readiness
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
```

### 3.3 Starting Web Frontend (`@judge/frontend`)

```powershell
pnpm dev:frontend
# Vite dev server starts on http://localhost:5173
```

### 3.4 Starting Judge Worker (`@judge/worker`)

The worker must run with access to the host Docker daemon:

```powershell
pnpm dev:worker
```

Verify that the output contains:
`[Judge-Worker] Host-run BullMQ worker started`

---

## 4. Running Submissions

### Submitting via Frontend

1. Open `http://localhost:5173` in a browser.
2. Sign in or register an account.
3. Navigate to **Problems** -> Select any problem (e.g. `Two Sum`).
4. Select language (`javascript` or `python`).
5. Click **Run Sample** to verify code against sample test cases.
6. Click **Submit** to trigger official judging against all hidden test cases.
7. Observe live SSE updates transitions: `QUEUED` -> `RUNNING` -> `ACCEPTED` (or other verdict).

---

## 5. Diagnosing Failed Jobs & Verifying Logs

### 5.1 Inspecting Worker Logs

Worker emits structured JSON logs via Pino:

```powershell
# Look for submission evaluation errors
pnpm dev:worker | grep -i "failureCategory"
```

Common failure categories:

- `COMPILATION_ERROR`: User code failed syntax check (`SyntaxError` or invalid function declaration).
- `TIME_LIMIT_EXCEEDED`: User code exceeded `timeLimitMs`.
- `MEMORY_LIMIT_EXCEEDED`: Container was killed by Linux OOM killer exceeding RAM+swap limit.
- `OUTPUT_LIMIT_EXCEEDED`: User code exceeded 64 KB of output.
- `RUNTIME_ERROR`: User code threw an unhandled exception or non-zero exit code.
- `DOCKER_DAEMON_UNAVAILABLE`: Worker lost connection to the host Docker engine.

### 5.2 Checking Stalled or Failed Jobs in Redis

```powershell
docker exec -it judge_redis redis-cli

# Inspect failed job count in BullMQ
LLEN "bull:judge-queue:failed"

# View recent failed job IDs
LRANGE "bull:judge-queue:failed" 0 10
```

---

## 6. Recovering Workers & Stale Submissions

If a judge worker crashes while processing submissions:

1. Submissions remain in PostgreSQL as `status = 'RUNNING'`.
2. When a worker starts (or during periodic sweeper execution every `RECOVERY_INTERVAL_MS` = 30s):
   - `SubmissionRecoveryService` queries submissions where `status = 'RUNNING'` and `updated_at < NOW() - 60s`.
   - If `retry_count < WORKER_MAX_ATTEMPTS`, the submission is re-enqueued onto `judge-queue`.
   - If retries are exhausted, the submission is marked `INTERNAL_ERROR` and finalized.

To manually trigger recovery:
Restart the worker process (`pnpm dev:worker`), which automatically runs `runSweep()` at startup.

---

## 7. Cleaning Up Docker Resources

### 7.1 Orphaned Sandbox Containers

If abnormal terminations leave rogue `judge-sandbox-*` containers on the host:

```powershell
# List existing sandbox containers
docker ps -a --filter "name=judge-sandbox-"

# Remove all judge sandbox containers forcefully
docker rm -f $(docker ps -aq --filter "name=judge-sandbox-")
```

### 7.2 Pruning Dangling Docker Images & Volumes

```powershell
# Remove dangling build cache
docker image prune -f

# CAUTION: Only run if resetting entire local development environment
# docker compose down -v
```
