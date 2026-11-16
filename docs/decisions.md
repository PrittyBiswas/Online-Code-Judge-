# Architecture Decision Records (ADRs)

This document records the major architectural decisions made during the design, development, and hardening of the **Online Code Judge** platform.

---

## ADR-001: Pnpm Monorepo with Strict TypeScript Baseline

- **Status**: Accepted & Implemented (Day 2)
- **Context**: The project spans multiple interrelated subsystems: a web frontend, REST/SSE API, asynchronous background worker, scheduled cron sweeper, test mail stub, and shared data contracts. We needed a build tool and dependency manager that eliminated duplicate packages, prevented dependency hoisting bugs, and enforced end-to-end type safety.
- **Decision**: Adopt a `pnpm` workspace monorepo (`apps/*`, `packages/*`) using `workspace:*` package protocol and a shared `tsconfig.base.json` enforcing strict TypeScript (`strict: true`, `noImplicitAny: true`, `exactOptionalPropertyTypes: false`).
- **Alternatives Considered**:
  - _npm / yarn v1 workspaces_: Discarded due to phantom dependency bugs from flat `node_modules` hoisting.
  - _Nx / Turborepo_: Discarded as unnecessary initial complexity; native pnpm workspaces and package filters provide sufficient build orchestration.
  - _Separate git repositories_: Discarded because contract changes between API, worker, and frontend would require multi-repo coordination and version publishing.
- **Consequences**:
  - _Positive_: Fast installs via hardlinks, zero phantom dependencies, shared contracts (`@judge/shared`) compile instantly for all apps.
  - _Negative_: Workspace dependencies require deliberate build ordering (`pnpm build:shared` before app builds).

---

## ADR-002: Docker Container Sandboxing with Network and Capability Dropping

- **Status**: Accepted & Implemented (Day 6, verified Day 9)
- **Context**: The system must execute arbitrary, untrusted JavaScript and Python submissions without risking host compromise, data theft, Denial of Service (DoS), or local network pivoting.
- **Decision**: Execute every submission in a fresh, throwaway Docker container created with:
  `--rm`, `--network none`, `--memory=128m --memory-swap=128m`, `--cpus=0.5`, `--pids-limit=64`, `--read-only`, `--tmpfs /tmp:rw,noexec,nosuid,size=16m`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--sysctl net.ipv4.ip_unprivileged_port_start=1024`, and `--user 1000:1000`.
- **Alternatives Considered**:
  - _Node.js `vm` module / `vm2`_: Discarded because process-level JavaScript sandboxes suffer from recurring prototype pollution and sandbox escape vulnerabilities.
  - _Virtual Machines (microVMs)_: High isolation, but too slow for high-frequency submission throughput (seconds startup vs 100ms container start).
  - _Linux `chroot` / raw namespaces_: Highly complex to maintain portably across development hosts.
- **Consequences**:
  - _Positive_: Verified immune against fork bombs (`SAFE-03`), memory exhaustion (`SAFE-02`), network dials (`SAFE-04`), file modifications (`SAFE-05`), and privilege escalation (`SAFE-07`).
  - _Negative_: Host requires Docker Engine / Desktop running locally.

---

## ADR-003: BullMQ with Redis for Asynchronous Queueing and State Management

- **Status**: Accepted & Implemented (Day 3 & Day 6)
- **Context**: Code execution latency ranges from 200ms to 5,000ms. Handling evaluation synchronously inside Express request cycles would rapidly exhaust HTTP connection pools and crash the API under load.
- **Decision**: Introduce BullMQ backed by Redis 7. Submissions are enqueued onto `judge-queue` (official submissions) and `sample-run-queue` (sample test runs) with immediate `202 Accepted` HTTP responses. Background workers pull jobs with controlled concurrency.
- **Alternatives Considered**:
  - _RabbitMQ / AMQP_: Feature-rich but introduces an additional infrastructure dependency alongside Redis.
  - _Apache Kafka_: Excessive operational overhead for low-to-medium partition requirements.
  - _In-memory Node EventEmitter_: Discarded because jobs are lost if the API process restarts.
- **Consequences**:
  - _Positive_: Predictable concurrency (`WORKER_CONCURRENCY`), automatic retry backoff, stalled job recovery, and decoupled scaling.
  - _Negative_: Requires atomic compensating transactions if Redis enqueueing fails after database insertion.

---

## ADR-004: PostgreSQL Relational Database with Drizzle ORM

- **Status**: Accepted & Implemented (Day 4 & Day 5)
- **Context**: The platform requires ACID compliance for user accounts, problem metadata, submissions, contests, and contest participants. We needed a modern TypeScript ORM that offers SQL-like control without heavy runtime overhead.
- **Decision**: Use PostgreSQL 16 managed via Drizzle ORM and `drizzle-kit` migrations.
- **Alternatives Considered**:
  - _Prisma ORM_: Discarded due to heavy Rust engine binary, slower query startup times, and opaque query generation for complex join/ordering queries.
  - _TypeORM / MikroORM_: Discarded due to decorator complexity and weaker TypeScript inference compared to Drizzle.
  - _MongoDB / Document DB_: Discarded because submission attribution, contest participation, and foreign keys demand strong relational integrity.
- **Consequences**:
  - _Positive_: Pure TypeScript schema definition (`apps/api/src/db/schema.ts`), zero runtime engine overhead, explicit SQL generation, and type-safe query builders.
  - _Negative_: Schema changes require explicit migration scripts (`pnpm db:generate && pnpm db:migrate`).

---

## ADR-005: S3-Compatible MinIO Storage for Hidden Test Cases

- **Status**: Accepted & Implemented (Day 6 & Day 12)
- **Context**: Code judge problems frequently have dozens of test cases with large input and expected output payloads (tens of megabytes). Storing large text blobs in PostgreSQL tables leads to database bloat, slow backups, and high memory usage.
- **Decision**: Store test case input (`.in`) and output (`.out`) files in an S3-compatible MinIO object store (`judge-testcases`). PostgreSQL `test_cases` table stores only the object keys and metadata.
- **Alternatives Considered**:
  - _PostgreSQL `BYTEA` / `TEXT` columns_: Causes excessive table bloat and slows down index scans.
  - _Local filesystem storage_: Fails when API and Worker run on different nodes or containerized environments.
- **Consequences**:
  - _Positive_: Infinite scalable storage, fast streaming downloads via AWS SigV4, clean relational tables.
  - _Negative_: Deleting a problem requires coordinated two-phase cleanup (PostgreSQL transaction + MinIO object deletion).

---

## ADR-006: Server-Sent Events (SSE) for Real-Time Updates with Polling Fallback

- **Status**: Accepted & Implemented (Day 16 & Day 19)
- **Context**: Users expect instantaneous visual feedback when a submission moves from `QUEUED` to `RUNNING` to final `Verdict`.
- **Decision**: Implement Server-Sent Events (`GET /api/submissions/:id/live` and `GET /api/contests/:id/live`) powered by Redis Pub/Sub channels. The frontend connects using standard browser `EventSource` (`withCredentials: true`) and automatically falls back to bounded HTTP polling if SSE disconnects.
- **Alternatives Considered**:
  - _WebSockets (`ws` / `socket.io`)_: Two-way communication is unnecessary since clients only receive status updates. WebSockets complicate cookie authentication, reverse proxies, and load balancers.
  - _Client Polling Only_: High request overhead, delayed updates, and unnecessary database load.
- **Consequences**:
  - _Positive_: Uses standard HTTP, automatic browser reconnects, simple cookie authentication, lightweight server resource consumption.
  - _Negative_: Redis Pub/Sub is non-durable; requires snapshot buffering to prevent race conditions during initial client connect.

---

## ADR-007: HttpOnly Cookie-Based JWT Session Management

- **Status**: Accepted & Implemented (Day 10 & Day 11)
- **Context**: Traditional single-page applications often store JWT access tokens in `localStorage` or `sessionStorage`, leaving them vulnerable to Cross-Site Scripting (XSS) token exfiltration.
- **Decision**: Store JWTs exclusively in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `token` (`secure: true` in production). Omit tokens entirely from JSON responses.
- **Alternatives Considered**:
  - _LocalStorage JWTs_: High security risk; any injected JavaScript can read and exfiltrate the token.
  - _OAuth2 / Full Refresh Token Rotation_: Over-engineered for initial milestone scope; deferred to future iterations.
- **Consequences**:
  - _Positive_: JavaScript cannot read or exfiltrate the session cookie, eliminating XSS token theft.
  - _Negative_: All client-server calls must send credentials (`credentials: 'include'` / `withCredentials: true`), requiring strict CORS origin configuration.

---

## ADR-008: Composite Score Encoding for Redis Sorted Set Leaderboards

- **Status**: Accepted & Implemented (Day 17 & Day 18)
- **Context**: The judge requires real-time global and contest leaderboards ranked primarily by number of solved problems (descending) and secondarily by penalty time in seconds (ascending). Redis Sorted Sets (`ZSET`) rank elements by a single 64-bit IEEE floating point score.
- **Decision**: Encode solves and penalties into a single composite score:
  $$\text{Score} = (\text{problemsSolved} \times 10^7) + (10^7 - 1 - \text{penaltySeconds})$$
- **Alternatives Considered**:
  - _Relational SQL queries on every request_: Heavy database queries on large submission sets.
  - _Separate Redis keys for solves and penalties_: Requires application-level sorting of the entire dataset on every read.
- **Consequences**:
  - _Positive_: $O(\log N)$ updates on solve, instant $O(\log N + M)$ ranged pagination via `ZREVRANGEBYSCORE` / `ZREVRANGE`.
  - _Negative_: Effective penalty is capped at $10^7 - 1$ seconds (~115 days), which exceeds any contest duration.

---

## ADR-009: Distributed Lock with Atomic Lua Renewal for Contest & Notification Reconciliation

- **Status**: Accepted & Implemented (Day 20 & Day 22)
- **Context**: Periodic background tasks (sweeping contest lifecycle transitions and reconciling missing submission notifications) must execute reliably across multiple API/Worker instances without duplicate notifications or split-brain execution.
- **Decision**: Implement a distributed lock in Redis with a unique fencing token (`crypto.randomUUID()`), TTL, periodic heartbeat renewal watchdog using atomic Lua scripts, and atomic Lua release that verifies token ownership before releasing.
- **Alternatives Considered**:
  - _Uncoordinated local `setInterval`_: Causes duplicate notification dispatching if more than one API instance runs.
  - _PostgreSQL table locks (`pg_try_advisory_lock`)_: Viable, but couples scheduling locks directly to relational database connection pools.
- **Consequences**:
  - _Positive_: Guaranteed single-instance execution, lock automatically expires if the node dies, zero risk of releasing another node's lock.
  - _Negative_: Dependent on Redis availability; jobs abort if the lock heartbeat fails to renew.

---

## ADR-010: Multi-Stage Production Dockerization with Nginx Reverse Proxy

- **Status**: Accepted & Implemented (Day 22)
- **Context**: Preparing the system for production deployment while maintaining local development simplicity. Production containers must be lightweight, secure, and shielded from public network exposure.
- **Decision**: Create multi-stage Dockerfiles (`infrastructure/docker/api/`, `infrastructure/docker/worker/`, `infrastructure/docker/frontend/`) and a standalone `docker-compose.prod.yml`. Serve the frontend via Nginx Alpine, proxying `/api/` and `/health` requests to the internal API container. Keep internal datastores (PostgreSQL, Redis, MinIO) unexposed to public host ports.
- **Alternatives Considered**:
  - _Single all-in-one container_: Violates container best practices and combines untrusted worker code with public API servers.
  - _Direct host deployment (systemd / PM2)_: Harder to reproduce across different operating systems.
- **Consequences**:
  - _Positive_: Small Alpine images, unprivileged `node` user execution in API, unified port 80 ingress, automated container health checks.
  - _Negative_: Worker requires `/var/run/docker.sock` mount to invoke sibling sandboxes.
