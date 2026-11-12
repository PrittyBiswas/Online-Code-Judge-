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
