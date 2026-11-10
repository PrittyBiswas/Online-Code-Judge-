# Safety Rules & Sandbox Isolation Specification

Running untrusted, arbitrary user code carries significant security risks. A single flaw can allow a malicious submission to compromise the host system, steal sensitive data, consume all system resources, or wage denial-of-service attacks.

This document details every safety rule implemented in this project, explaining the exact Docker command line and flag justifications.

---

## The Docker Sandbox Command

Every untrusted submission is executed using `child_process.execFile` (never through string interpolation in a shell) with the following flags:

```bash
docker run \
  --name judge-sandbox-<timestamp>-<uuid> \
  --rm \
  --network none \
  --memory=128m \
  --memory-swap=128m \
  --cpus=0.5 \
  --pids-limit=64 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user 1000:1000 \
  -i \
  node:20-alpine \
  node -e "<runner_script>"
```

---

## Detailed Breakdown of Flags & Protections

### 1. Disposable Containers (`--rm` & unique `--name`)

- **Why**: Prevents leftover stopped containers from cluttering host disk space and leaking states between runs.
- **Guarantee**: If a run finishes or is killed, the container is destroyed immediately.

### 2. Complete Network Isolation (`--network none`)

- **Why**: Prevents untrusted code from opening sockets, downloading malware, mining cryptocurrency, making external HTTP calls, or probing internal host ports / Docker network services (e.g. Postgres or Redis).
- **Attack Proved**: `AC-SAFE-04 (Network)` — any `fetch()` or TCP socket call immediately fails.

### 3. Memory Capping (`--memory=128m` & `--memory-swap=128m`)

- **Why**: Disabling swap by setting swap equal to RAM forces the Linux Out-Of-Memory (OOM) killer to terminate the container immediately if it tries to allocate past 128MB.
- **Attack Proved**: `AC-SAFE-02 (Memory Bomb)` — code allocating huge arrays/buffers gets killed with exit code 137 (`MEMORY_LIMIT_EXCEEDED`), leaving the host completely unaffected.

### 4. CPU Throttling (`--cpus=0.5`)

- **Why**: Limits the container to half of a single CPU core, preventing infinite loops or compute-heavy attacks from starving the host OS or other judge workers.

### 5. Process Limit (`--pids-limit=64`)

- **Why**: Halts classic fork-bomb attacks (`function f(){ f() & f() }` or repeated `child_process.fork()`).
- **Attack Proved**: `AC-SAFE-03 (Fork Bomb)` — the container cannot spawn more than 64 processes and crashes before impacting host threads.

### 6. Read-Only Root Filesystem (`--read-only`)

- **Why**: Prevents the untrusted code from modifying system binaries, writing permanent scripts, or creating hidden backdoors in the container image.
- **Tmpfs scratch space**: `--tmpfs /tmp:rw,noexec,nosuid,size=16m` creates a temporary, memory-backed scratch directory mounted with `noexec` (cannot execute scripts from /tmp) and `nosuid` (cannot escalate privileges), strictly capped at 16MB.

### 7. Privilege Dropping (`--cap-drop ALL` & `--security-opt no-new-privileges`)

- **Why**: Drops all standard Linux capabilities (such as `CAP_NET_RAW`, `CAP_SYS_ADMIN`, `CAP_CHOWN`). `no-new-privileges` prevents SUID binaries from granting higher privileges.
- **Attack Proved**: `AC-SAFE-07 (Privileges)`.

### 8. Non-Root Execution (`--user 1000:1000`)

- **Why**: Running untrusted code as UID 0 (root) inside a container is extremely dangerous because container escapes would land the attacker as root on the host.

### 9. External Hard Wall-Clock Timeout

- **Why**: Container-internal timeouts can be hijacked or ignored by code that catches signals.
- **Mechanism**: The host worker sets a Node.js `setTimeout` that directly issues `docker kill <containerName>` if execution exceeds the limit.
- **Attack Proved**: `AC-SAFE-01 (Infinite Loop)`.

### 10. Output Capping (64 KB)

- **Why**: Malicious code printing gigabytes in a loop can cause out-of-memory errors on the worker or API.
- **Mechanism**: The worker streams stdout/stderr and immediately kills the container if cumulative bytes exceed 64 KB, returning `OUTPUT_LIMIT_EXCEEDED`.
- **Attack Proved**: `AC-SAFE-06 (Output Flood)`.

### 11. Host Worker Architecture (Safety Rule 6)

- **Crucial Rule**: The Docker socket (`/var/run/docker.sock`) is **never mounted into any container**.
- Giving a container access to the Docker socket gives that container root access to the entire host machine. Therefore, the `judge-worker` is run directly as a process on the host machine, safely interacting with the local Docker engine.
