# Pattern Notes — 13 Core Architectural Patterns

This document details the 13 core software engineering and distributed systems patterns implemented across the **Online Code Judge** platform.

---

## Pattern 1: Repository & Data Mapper Pattern

- **Problem it Solves**: Decouples application business logic from raw database queries, providing a clean abstraction layer and preventing SQL injection vulnerabilities.
- **How it Works**: Business services call strongly typed Drizzle ORM queries using TypeScript schemas (`apps/api/src/db/schema.ts`). Entity rows are mapped to domain DTOs before reaching the controller.
- **Where it is Implemented**:
  - `apps/api/src/db/index.ts`
  - `apps/api/src/modules/users/users.service.ts`
  - `apps/api/src/modules/problems/problems.service.ts`
  - `apps/api/src/modules/contests/contests.service.ts`
  - `apps/judge-worker/src/processor/judgeProcessor.ts` (`DrizzleJudgeRepository`)
- **Advantages**: Compile-time type checking for SQL fields, centralized query management, and straightforward test mocking.
- **Limitations**: Complex analytical queries require raw SQL escapes or specialized join builders.

---

## Pattern 2: Cache-Aside with Invalidation & Fallback Pattern

- **Problem it Solves**: Eliminates redundant database reads for high-traffic read paths (such as public problem listings and global leaderboard standings) while ensuring fresh data on mutations.
- **How it Works**: The service checks Redis first. If a cache hit occurs, data is returned immediately. On a cache miss, the service queries PostgreSQL, populates Redis with an expiration TTL, and returns the result. Mutations increment a version counter or delete the cache keys.
- **Where it is Implemented**:
  - `apps/api/src/modules/problems/problems.service.ts` (`getProblem`, `listProblems`)
  - `apps/api/src/modules/leaderboard/leaderboard.service.ts` (`getGlobalLeaderboard`)
- **Advantages**: Dramatic reduction in database CPU and disk I/O; system automatically falls back to PostgreSQL if Redis is offline.
- **Limitations**: Risk of stale reads during the brief window before invalidation propagates; thundering herd on popular keys after cache eviction.

---

## Pattern 3: Queue-Worker Asynchronous Processing Pattern

- **Problem it Solves**: Decouples high-volume HTTP submission requests from compute-intensive code compilation and sandboxed execution.
- **How it Works**: The API validates the submission payload, creates a `QUEUED` database row, and pushes a lightweight job to a BullMQ Redis queue (`judge-queue` or `sample-run-queue`). The API responds immediately with `202 Accepted`. Background judge workers pull jobs at a controlled concurrency limit.
- **Where it is Implemented**:
  - `apps/api/src/config/queue.ts`
  - `apps/api/src/modules/submissions/submissions.service.ts`
  - `apps/judge-worker/src/queue/worker.ts`
  - `apps/judge-worker/src/processor/judgeProcessor.ts`
- **Advantages**: Fast client response times, backpressure control, failure retries, and decoupled scaling of API and worker instances.
- **Limitations**: Clients must track job completion asynchronously via SSE or polling.

---

## Pattern 4: Disposable Sandbox Container Pattern (Zero-Trust Isolation)

- **Problem it Solves**: Safely executes arbitrary, untrusted user code (including malicious programs, infinite loops, and fork bombs) without risking host integrity.
- **How it Works**: Each code execution spawns a fresh Docker container using the Docker CLI. The container is configured with `--rm`, `--network none`, `--memory=128m`, `--memory-swap=128m`, `--cpus=0.5`, `--pids-limit=64`, `--read-only`, `--tmpfs /tmp:rw,noexec,nosuid,size=16m`, `--cap-drop ALL`, `--security-opt no-new-privileges`, and `--user 1000:1000`. Input is passed via standard input (`stdin`), never host bind mounts.
- **Where it is Implemented**:
  - `apps/judge-worker/src/sandbox/runner.ts` (`buildDockerArgs`, `runInSandbox`)
  - `apps/judge-worker/src/recovery/shutdown.ts` (`WorkerLifecycle`)
- **Advantages**: True Linux namespace and cgroup containment. Verified against 9 security attack categories (`SAFE-01` to `SAFE-09`).
- **Limitations**: Container initialization incurs ~100ms startup latency per test case; requires Docker daemon availability.

---

## Pattern 5: Optimistic Concurrency / Compare-And-Swap (CAS) Claiming Pattern

- **Problem it Solves**: Prevents double-evaluation or race conditions when multiple worker instances consume jobs from the same queue or during crashed-worker recovery.
- **How it Works**: When a worker begins processing a submission, it performs an atomic SQL update with a conditional guard:
  `UPDATE submissions SET status = 'RUNNING', updated_at = NOW() WHERE id = $1 AND status = 'QUEUED'`.
  If another process claimed the row first, `rowCount` returns 0 and the duplicate execution is safely aborted.
- **Where it is Implemented**:
  - `apps/judge-worker/src/processor/judgeProcessor.ts` (`claimSubmissionRunning`)
  - `apps/judge-worker/src/recovery/recoveryService.ts` (`recoverStaleSubmissions`)
- **Advantages**: Eliminates database-level table locks while providing strict serializability.
- **Limitations**: Rejected concurrent attempts must be classified as benign skips rather than unhandled errors.

---

## Pattern 6: Compensating Transaction Pattern (Saga / Fail-Safe Cleanup)

- **Problem it Solves**: Maintains data consistency across non-transactional boundaries (e.g. relational database, Redis queue, and S3 object storage) without distributed 2-phase commit (2PC).
- **How it Works**: If an operation succeeds in Step 1 (e.g. inserting a `QUEUED` row in PostgreSQL) but fails in Step 2 (e.g. BullMQ Redis enqueueing throws an error), a catch handler executes a compensating transaction that deletes the database row and returns `503 Service Unavailable`. Similarly, problem creation cleans up uploaded MinIO objects if the DB transaction fails.
- **Where it is Implemented**:
  - `apps/api/src/modules/submissions/submissions.service.ts` (`submitCode`)
  - `apps/api/src/modules/problems/problems.service.ts` (`createProblem`)
- **Advantages**: Prevents "ghost" submissions that remain in `QUEUED` forever.
- **Limitations**: If the compensating deletion query itself fails (e.g. during catastrophic database crash), an orphaned record requires asynchronous cleanup sweepers.

---

## Pattern 7: Observer / Pub-Sub Pattern (Redis Channel Event Fanout)

- **Problem it Solves**: Decouples worker verdict persistence from user-facing real-time notifications, allowing multiple API instances to broadcast events to connected clients.
- **How it Works**: When a worker finishes evaluation or contest status changes, it publishes an event JSON to a Redis channel (`submission:events`, `contest:updates`, `notification:events`). API instances subscribed via dedicated Redis subscriber connections receive the message and forward it to connected SSE clients.
- **Where it is Implemented**:
  - `apps/api/src/config/redis.ts` (`redisClient`, `redisSubscriber`)
  - `apps/api/src/events/sse.ts`
  - `apps/api/src/events/contest-sse.ts`
  - `apps/judge-worker/src/queue/worker.ts`
- **Advantages**: Low latency, lightweight footprint, and horizontal scaling across multiple API nodes.
- **Limitations**: Redis Pub/Sub is fire-and-forget; if an API instance is restarting when a message is published, the event is not queued.

---

## Pattern 8: Server-Sent Events (SSE) Monotonic Streaming with Pre-Snapshot Buffering Pattern

- **Problem it Solves**: Delivers live submission verdicts and contest updates to web browsers over HTTP without the race condition where fast worker events are missed before the initial DB snapshot loads.
- **How it Works**: The client opens an `EventSource` stream (`/api/submissions/:id/live`). The server registers the client in memory _before_ querying PostgreSQL for the current state. Any Redis Pub/Sub events that arrive while the DB query is in-flight are stored in a client-specific buffer. Once the initial state is transmitted, buffered events are delivered in monotonic order (`QUEUED < RUNNING < terminal`).
- **Where it is Implemented**:
  - `apps/api/src/events/sse.ts` (`SSEManager`, `deliverToClient`)
  - `apps/api/src/events/contest-sse.ts` (`ContestSSEManager`)
  - `apps/frontend/src/components/SampleRunnerPanel.tsx`
- **Advantages**: Eliminates out-of-order state transitions and missed verdict events; uses standard HTTP with automatic browser reconnects.
- **Limitations**: Long-lived HTTP connections consume server socket descriptors; requires keepalive pings every 15s to keep proxies alive.

---

## Pattern 9: Distributed Lock with Heartbeat Watchdog & Atomic Lua Renewal Pattern

- **Problem it Solves**: Ensures that scheduled maintenance tasks (such as contest lifecycle transitions and verdict reconciliation) execute on exactly one node in a cluster without split-brain conflicts.
- **How it Works**: A node acquires a lock key in Redis (`SET lock:contest:sweep token NX PX 10000`). While work is in progress, a background timer repeatedly renews the TTL using an atomic Lua script that verifies the token. When work completes, an atomic Lua script releases the lock only if the token still matches.
- **Where it is Implemented**:
  - `apps/api/src/modules/notifications/notifications.service.ts` (`checkAndDispatchContestLifecycleNotifications`)
  - `apps/api/src/modules/leaderboard/leaderboard.service.ts` (`rebuildLeaderboard`)
- **Advantages**: Prevents lock hijacking; if the process crashes, the lock automatically expires; former owners cannot release a newer owner's lock.
- **Limitations**: Depends on accurate time synchronization across host nodes.

---

## Pattern 10: Composite Score Encoding Pattern (Redis Sorted Set Standings)

- **Problem it Solves**: Real-time leaderboards must rank competitors primarily by problems solved (descending) and secondarily by penalty time (ascending). Redis Sorted Sets rank elements using a single numeric floating-point score.
- **How it Works**: The application packs solved counts and penalty seconds into a single floating-point number:
  $$\text{Score} = (\text{solved} \times 10^7) + (10^7 - 1 - \text{penaltySeconds})$$
  Higher solve counts dominate the primary magnitude, while lower penalties produce a higher fractional component.
- **Where it is Implemented**:
  - `packages/shared/src/utils/score.ts` (`encodeLeaderboardScore`, `decodeLeaderboardScore`)
  - `apps/api/src/modules/leaderboard/leaderboard.service.ts`
  - `apps/api/src/modules/contests/contests.service.ts`
- **Advantages**: Enables $O(\log N)$ atomic rank updates and instant ranged pagination via native `ZREVRANGEBYSCORE`.
- **Limitations**: Imposes an upper bound on maximum penalty seconds ($10^7 - 1 \approx 115$ days), well beyond practical contest lengths.

---

## Pattern 11: Keyset (Cursor-Based) Pagination Pattern

- **Problem it Solves**: Offset-based pagination (`OFFSET 10000 LIMIT 50`) degrades in performance as page depth increases ($O(N)$ table scans) and suffers from duplicate/missed rows when items are added during browsing.
- **How it Works**: The API encodes the sort value (e.g. `createdAt`) and primary key ID of the last item into an opaque, base64url-encoded cursor. The next page queries:
  `WHERE (created_at, id) < ($cursorCreatedAt, $cursorId) ORDER BY created_at DESC, id DESC LIMIT $limit`.
- **Where it is Implemented**:
  - `apps/api/src/modules/problems/problems.service.ts` (`listProblems`)
  - `packages/shared/src/schemas/problem.schema.ts` (`queryProblemsSchema`)
  - `apps/frontend/src/pages/ProblemsPage.tsx`
- **Advantages**: Deterministic $O(1)$ query performance backed by composite indexes; immune to row-shift anomalies.
- **Limitations**: Does not allow jumping directly to an arbitrary page number (e.g. "Go to Page 42").

---

## Pattern 12: Outbox / Periodic Sweeper Reconciliation Pattern

- **Problem it Solves**: Guarantees eventual consistency when asynchronous notifications or verdicts fail to publish due to transient network or worker interruptions.
- **How it Works**: A background timer (`setInterval` every 60s) executes a reconciliation query that selects completed submissions that lack a corresponding notification record. It processes them in bounded batches (1,000 items), records the notifications idempotently, and publishes live events.
- **Where it is Implemented**:
  - `apps/api/src/modules/notifications/notifications.service.ts` (`reconcileMissingSubmissionNotifications`)
  - `apps/api/src/server.ts` (`sweeperInterval`)
- **Advantages**: Guarantees that downtime or transient worker failures do not result in permanently lost notifications.
- **Limitations**: Creates minor periodic database read load even when no backlog exists.

---

## Pattern 13: Graceful Degradation / Circuit-Breaking (Fail-Open & Polling Fallback) Pattern

- **Problem it Solves**: Prevents secondary dependency failures (e.g. Redis downtime or SSE disconnects) from completely blocking critical user journeys like authentication and submission viewing.
- **How it Works**:
  1. _Authentication_: If Redis is unavailable, brute-force lockout checks fail open (`isRedisHealthy() = false`), allowing valid logins to proceed via PostgreSQL password verification while logging warnings.
  2. _Frontend Live Updates_: If the SSE connection fails, the frontend automatically activates bounded HTTP polling (`GET /api/submissions/:id`) with exponential backoff.
- **Where it is Implemented**:
  - `apps/api/src/modules/auth/auth.service.ts` (`checkLoginLockout`)
  - `apps/frontend/src/components/SampleRunnerPanel.tsx` (`trackSubmissionViaPolling`)
  - `apps/api/src/modules/leaderboard/leaderboard.service.ts` (`computeFromDatabase`)
- **Advantages**: High application availability; non-critical failures degrade user experience gracefully rather than producing hard outages.
- **Limitations**: Failing open on rate limits temporarily weakens brute-force defense during Redis outages.
