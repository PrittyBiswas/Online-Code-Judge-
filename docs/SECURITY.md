# Online Code Judge — Security & Isolation Architecture

This document describes the security posture, isolation boundaries, defense-in-depth mechanisms, and threat mitigation strategies implemented in the Online Code Judge platform.

---

## 1. Docker Code Execution Sandbox

Untrusted user code is executed inside ephemeral, isolated Docker containers spawned directly by the Judge Worker (`@judge/worker`). Each execution runs in a pristine sandbox that is destroyed immediately after evaluation.

### Mandatory Container Isolation Flags:

```bash
docker run --rm \
  --network none \
  --read-only \
  --user 1000:1000 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 64 \
  --memory 512m \
  --memory-swap 512m \
  --cpus 1.0 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -v <ephemeral_src_dir>:/app:ro \
  judge-runner <command>
```

### Key Sandbox Protections:

1. **Network Disconnected (`--network none`)**:
   - Outbound and inbound network access is completely disabled at the kernel namespace level.
   - Any attempt to resolve DNS, establish TCP/UDP sockets, or communicate with the internet or local Docker network fails immediately (`ENETUNREACH`).
2. **Read-Only Root Filesystem (`--read-only`)**:
   - The container filesystem is immutable. Untrusted programs cannot overwrite system binaries, install software, or modify kernel runtime configurations.
   - Only a restricted `/tmp` tmpfs volume with `noexec` and `nosuid` is mounted for scratch execution where needed.
3. **Unprivileged Execution (`--user 1000:1000` + `--cap-drop ALL`)**:
   - Code runs as a non-root unprivileged user (`judge:judge`).
   - All Linux kernel capabilities are explicitly dropped (`CAP_SYS_ADMIN`, `CAP_NET_ADMIN`, `CAP_PTRACE`, etc.).
   - `no-new-privileges` prevents privilege escalation via `setuid`/`setgid` binaries.
4. **PID Limits & Fork-Bomb Protection (`--pids-limit 64`)**:
   - Restricts maximum simultaneous processes/threads to 64.
   - Attempts to exhaust host process tables via recursive forks are immediately stopped by the Linux kernel cgroup controller (`EAGAIN: Resource temporarily unavailable`).
5. **Memory and CPU Cgroups (`--memory 512m`, `--cpus 1.0`)**:
   - Memory is strictly capped with swap disabled (`--memory-swap = --memory`).
   - Out-of-memory memory allocations trigger the Linux OOM-killer inside the container, returning a controlled `MEMORY_LIMIT_EXCEEDED` verdict without degrading host resources.
6. **Hard Process Execution Timeouts**:
   - Worker enforces execution deadlines (`timeLimitMs` + grace period).
   - If a program fails to exit within the allowed duration, a `SIGKILL` is issued to the container, returning `TIME_LIMIT_EXCEEDED`.

---

## 2. Threat Matrix & Validation Suite

The platform includes an automated `attack-suite/` verifying defenses against hostile attack vectors:

| Attack Vector           | Hostile Payload Pattern           | Security Defense                    | Verified Outcome                                           |
| :---------------------- | :-------------------------------- | :---------------------------------- | :--------------------------------------------------------- |
| **Network Egress**      | `http.get('http://attacker.com')` | `--network none`                    | Network error (`ENETUNREACH`), container safely terminates |
| **Secret Exfiltration** | `process.env['DATABASE_URL']`     | No credentials mounted in container | Secrets map is clean; zero host credentials accessible     |
| **Filesystem Escape**   | `fs.readFileSync('/etc/shadow')`  | Non-root + read-only rootfs         | Permission Denied (`EACCES`), host filesystem isolated     |
| **Fork Bomb**           | `while(true) fork()`              | `--pids-limit 64`                   | Process creation blocked; kernel cgroup limits enforced    |
| **Infinite Loop**       | `while(true) {}`                  | Worker wall-clock watchdog          | Force-killed via `SIGKILL`, `TIME_LIMIT_EXCEEDED`          |
| **Memory Exhaustion**   | Allocate 4GB ArrayBuffer          | Memory cgroup limit (512MB)         | Process terminated via OOM killer, `MEMORY_LIMIT_EXCEEDED` |
| **Output Flooding**     | Infinite `console.log`            | Max output buffer clamp (64KB)      | Process halted, `OUTPUT_LIMIT_EXCEEDED`                    |

---

## 3. Application Security & Access Control

### Authentication & Cookies

- User passwords are encrypted using `bcrypt` with salt rounds = 10.
- Sessions use JSON Web Tokens (JWT) stored in `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookies.
- Access tokens have a short lifespan (15 minutes). Refresh tokens allow seamless rotation without exposing credentials in client-accessible localStorage.

### Role-Based Access Control (RBAC)

- Endpoints enforce authorization middleware checking user roles (`USER`, `PROBLEM_SETTER`, `ADMIN`).
- Problem authoring and modifications are restricted to setters and administrators.
- Contest administration and leaderboard manual rebuilds require `ADMIN` role.

### Submission Rate Limiting & Concurrency Control

- Redis-backed Token Bucket rate limiter prevents spamming submissions (`RATE_LIMITS.SUBMISSIONS_PER_MINUTE`).
- In-flight double-click guard (`doubleClickGuard`) rejects concurrent duplicate submissions for the same user and problem within a 2-second debounce window.

### Hidden Test Case Sanitization

- Test case input and expected output keys are stored in MinIO object storage.
- When querying submission results or problem test cases, hidden test cases (`isHidden: true`) are strictly filtered. The API never serializes hidden test inputs, outputs, or execution dumps to client responses.

### SQL Injection & Input Validation

- All database interactions use Drizzle ORM parameterized queries. Raw string concatenations for SQL are disallowed.
- Request payloads (auth, submissions, problems, profile updates) are validated at the router layer using strict Zod schemas with unexpected properties stripped or rejected.
