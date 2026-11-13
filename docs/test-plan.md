# Security & Regression Test Plan (Day 9)

This document defines the automated security attack suite (`SAFE-01` through `SAFE-09`) and regression checks for the Online Code Judge execution sandbox.

---

## 1. Prerequisites (Windows PowerShell + Docker Desktop)

1. Start **Docker Desktop** with Linux containers enabled.
2. Verify Docker engine and required sandbox images (`node:20-alpine`, `python:3.11-alpine`):

```powershell
docker info
docker image inspect node:20-alpine
docker image inspect python:3.11-alpine
```

3. Start local Compose dependencies (for API/Worker DB + Redis + MinIO integration tests):

```powershell
docker compose up -d
pnpm infra:verify
```

---

## 2. Security Attack Suite (`SAFE-01` to `SAFE-09`)

Implemented in [`apps/judge-worker/tests/safety-suite.integration.test.ts`](../apps/judge-worker/tests/safety-suite.integration.test.ts) using standalone fixtures in [`attack-suite/`](../attack-suite/README.md). Every test executes inside real Docker containers via `runInSandbox()` / `docker` CLI (no mocks).

| Test ID   | Security Purpose                          | Execution & Fixtures                                                                                      | Expected Result                                                                              | Observed Result                                                                |
| :-------- | :---------------------------------------- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| `SAFE-01` | Prevent infinite loops / CPU hang         | JS (`infinite-loop/`) & Python infinite loops (`timeLimitMs: 700`) + follow-up check                      | `TIME_LIMIT_EXCEEDED`, worker stays responsive                                               | **PASS** — terminated at timeout, follow-up `ACCEPTED`                         |
| `SAFE-02` | Enforce RAM + swap cap (`OOM`)            | Bounded JS (`memory-bomb/`) & Python 256 MB `bytearray` under `64m` limit                                 | `MEMORY_LIMIT_EXCEEDED`                                                                      | **PASS** — OOM killed cleanly (`MEMORY_LIMIT_EXCEEDED`)                        |
| `SAFE-03` | Prevent fork bombs / PID exhaustion       | JS (`fork-bomb/`) & Python `os.fork()` loop under `--pids-limit`                                          | `RUNTIME_ERROR` or `TIME_LIMIT_EXCEEDED`, host unaffected                                    | **PASS** — contained by `--pids-limit`, zero leaks                             |
| `SAFE-04` | Enforce `--network none` isolation        | `network-attempt/` (DNS/HTTP) + direct TCP dials (`1.1.1.1:80`, `127.0.0.1:5433`, `127.0.0.1:6379`)       | All outbound/local connections blocked                                                       | **PASS** — DNS/HTTP `TLE`, TCP sockets `RUNTIME_ERROR` (`ALL_SOCKETS_BLOCKED`) |
| `SAFE-05` | Enforce filesystem isolation              | Harmless host temp marker + `file-access/` + `tmp-escape/` (`/` write, `/tmp` `noexec`, 16 MB `/tmp` cap) | Host marker unreadable, root FS read-only, `/tmp` `noexec` & capped                          | **PASS** — all 4 escape flags `false`, `RUNTIME_ERROR`                         |
| `SAFE-06` | Prevent stdout & stderr buffer exhaustion | `output-flood/` (stdout) + `stderr-flood/` (stderr)                                                       | `OUTPUT_LIMIT_EXCEEDED`, bounded output buffers                                              | **PASS** — capped at 64 KB (`OUTPUT_LIMIT_EXCEEDED`)                           |
| `SAFE-07` | Prevent privilege escalation              | `privilege-check/` + `env-secret-probe/` (`/proc/self/status`)                                            | `UID/GID 1000`, `CapEff 0`, `NoNewPrivs 1`, port 80 `EACCES`, `RUNTIME_ERROR`                | **PASS** — all privilege checks blocked, `RUNTIME_ERROR`                       |
| `SAFE-08` | Zero container/state leakage across runs  | Write `/tmp/cross_run_leak.txt` in run 1 -> check in run 2; run TLE, OLE, exit-42, normal Python          | Zero `judge-sandbox-*` containers, zero `/tmp` leak, final `ACCEPTED`                        | **PASS** — clean isolation & zero leftover containers                          |
| `SAFE-09` | Verify live Docker boundaries & secrets   | `docker inspect` on live hardened container, `docker-compose.yml` check, `env-secret-probe/`              | Non-privileged, read-only, `--network none`, `CapDrop ALL`, zero mounts, zero `.env` secrets | **PASS** — all HostConfig/Config/Mounts/Env checks passed                      |

---

## 3. Execution Commands (Windows PowerShell)

```powershell
# Run SAFE-01 to SAFE-09 live Docker security suite
pnpm test:safety

# Run quick attack-suite CLI verification script
pnpm --filter @judge/worker test:sandbox

# Run full Day 1–9 regression suite
pnpm test               # Offline unit tests
pnpm test:integration   # Live API + Postgres + BullMQ + MinIO + Worker integration tests
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

---

## 4. Day 15 Official Submission & Sample Verification

- **API Unit/HTTP Tests (`apps/api/tests/submissions.test.ts`, `sample-run.test.ts`, `sample-queue-config.test.ts`)**: Verify `POST /api/submissions` (`202` + `QUEUED`), queue-failure DB compensation (`503` + row deletion), `GET /api/submissions/:id` ownership (`403` cross-user), rate limits & double-click guard (`429`), and `sampleRunQueue` bounded retention.
- **Worker Unit & Integration Tests (`apps/judge-worker/tests/worker-unit.test.ts`, `worker.integration.test.ts`, `sample-run.integration.test.ts`)**: Verify atomic CAS claiming, all test-case evaluation from MinIO/Silo, early stopping, JS/Python verdicts (`ACCEPTED`, `WRONG_ANSWER`, `TLE`, `MLE`, `OLE`, `RE`, `CE`, `INTERNAL_ERROR`), and idempotent verdict persistence.
- **Frontend Tests (`apps/frontend/tests/sample-runner.test.tsx`)**: Verify official **Submit** (`202` -> `QUEUED` -> `RUNNING` -> `Accepted`), live `EventSource` SSE updates (`withCredentials: true`), terminal/unmount stream cleanup, SSE error -> bounded polling fallback, and **Check Status** recovery without duplicate submission.
- **Backend SSE Tests (`apps/api/tests/sse.test.ts`, `postgres.integration.test.ts`)**: Verify `401`/`404`/`403` auth & ownership on `GET /api/submissions/:id/live`, snapshot + Pub/Sub buffering race protection, monotonic status ordering, terminal auto-close, secret stripping, and Redis disconnect stream closure.

---

## 5. Day 17 Leaderboard Verification

- **API & Service Tests (`apps/api/tests/leaderboard.test.ts`, `postgres.integration.test.ts`)**:
  - `GET /api/leaderboard`: Public unauthenticated access returning ranked entries with bounded pagination metadata (`page`, `limit`, `total`, `totalPages`).
  - Query parameter validation: rejects `page <= 0`, `limit <= 0`, `limit > 100`, or non-numeric parameters with `400 Bad Request`.
  - Ranking calculation: only `ACCEPTED` submissions contribute; duplicate solves on the same problem only credit once using earliest penalty; tie-breaking by lower penalty time; deterministic secondary sorting by username and userId.
  - Public data redaction: strictly exposes only `{ rank, userId, username, problemsSolved, totalPenaltySeconds, score }`, never leaking email, password hash, role, source code, or tokens.
  - Rebuild endpoint: `POST /api/leaderboard/rebuild` requires `ADMIN` role (`401` unauthenticated, `403` standard user, `200` admin).
  - Caching & Fallback: reads from Redis Sorted Set (`judge:leaderboard:global`) when populated; automatically falls back to PostgreSQL `submissions` and `users` when Redis is empty or unhealthy.
- **Frontend Tests (`apps/frontend/tests/leaderboard.test.tsx`)**:
  - Navigation: Header contains `/leaderboard` link.
  - Standings display: Renders ranked users, rank badges (#1 Gold, #2 Silver, #3 Bronze), solved counts, formatted penalty time, and scores.
  - Loading, empty & error states: Shows skeleton on initial load, empty state when no ranked users exist, and alert with retry button on API failure.
  - User highlighting: Identifies and highlights the current authenticated user's row with a "You" badge.
  - Pagination: Navigates between pages with Previous/Next buttons and updates displayed slice.
