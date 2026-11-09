# Attack Suite

This directory contains deliberately malicious programs used to **verify** the sandbox security model. Each subdirectory is a named attack vector. The sandbox must resist all of them.

## Purpose

Before declaring the judge safe for production, run each attack against the live sandbox and confirm the expected verdict.

## Attack Catalogue

| Attack | Expected Verdict | Safety Rule Tested |
|--------|-----------------|-------------------|
| `infinite-loop/` | `TIME_LIMIT_EXCEEDED` | Hard wall-clock timeout |
| `memory-bomb/` | `MEMORY_LIMIT_EXCEEDED` | `--memory=128m` |
| `fork-bomb/` | `RUNTIME_ERROR` / `TLE` | `--pids-limit=64` |
| `network-attempt/` | `RUNTIME_ERROR` | `--network none` |
| `file-access/` | `RUNTIME_ERROR` | `--read-only` root FS |
| `output-flood/` | `OUTPUT_LIMIT_EXCEEDED` | 64 KB stdout cap |
| `privilege-check/` | `RUNTIME_ERROR` | `--cap-drop ALL`, non-root UID |

## How to Run

```powershell
# From project root (requires Docker Desktop running)
cd apps/judge-worker
npx tsx src/sandbox/demo.ts
```

## Safety Rules Reference

See [`docs/safety.md`](../docs/safety.md) for the full container lockdown specification.

