# Attack Suite

This directory contains deliberately malicious programs used to **verify** the sandbox security model. Each subdirectory is a named attack vector. The sandbox must resist all of them.

## Purpose

Before declaring the judge safe for production, run each attack against the live sandbox and confirm the expected verdict.

## Attack Catalogue (SAFE-01 to SAFE-09)

| SAFE ID   | Attack Fixture / Suite                | Expected Verdict / Behavior | Safety Rule Tested                                                   |
| --------- | ------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `SAFE-01` | `infinite-loop/`                      | `TIME_LIMIT_EXCEEDED`       | External wall-clock timeout (`docker kill`)                          |
| `SAFE-02` | `memory-bomb/`                        | `MEMORY_LIMIT_EXCEEDED`     | `--memory=128m --memory-swap=128m` (OOM killer)                      |
| `SAFE-03` | `fork-bomb/`                          | `RUNTIME_ERROR` / `TLE`     | `--pids-limit=64`                                                    |
| `SAFE-04` | `network-attempt/`                    | `RUNTIME_ERROR` / `TLE`     | `--network none` (no DNS, HTTP, IP, local net)                       |
| `SAFE-05` | `file-access/`, `tmp-escape/`         | `RUNTIME_ERROR`             | `--read-only`, `/tmp` `noexec,nosuid,size=16m`                       |
| `SAFE-06` | `output-flood/`, `stderr-flood/`      | `OUTPUT_LIMIT_EXCEEDED`     | 64 KB combined stdout + stderr cap                                   |
| `SAFE-07` | `privilege-check/`                    | `RUNTIME_ERROR`             | `--cap-drop ALL`, `no-new-privileges`, UID 1000, sysctl port >= 1024 |
| `SAFE-08` | `safety-suite.integration.test.ts`    | Zero leaked containers/tmp  | `--rm` + `docker rm -f` + cross-run isolation                        |
| `SAFE-09` | `env-secret-probe/`, `docker inspect` | Secure config & no secrets  | Live HostConfig/Mounts/Env boundary checks                           |

## How to Run

```powershell
# Run full SAFE-01..SAFE-09 Vitest security suite (from project root)
pnpm test:safety

# Or run the quick sandbox attack demo script
pnpm --filter @judge/worker test:sandbox
```

## Safety Rules Reference

See [`docs/safety.md`](../docs/safety.md) for the full container lockdown specification.
