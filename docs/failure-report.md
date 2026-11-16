# Development Failure & Post-Mortem Report

This report documents actual engineering failures, edge cases, and unexpected behaviors encountered during the development of the **Online Code Judge**, detailing their root causes, corrective fixes, and architectural lessons learned.

---

## 1. Fork-Bomb SIGKILL / Exit Code 137 Misclassification (`SAFE-03`)

- **Symptoms**: During sandbox security testing (`SAFE-03`), the fork-bomb attack container (`attack-suite/fork-bomb/index.js`) exited with code 137 (`SIGKILL`) instead of `RUNTIME_ERROR` or process-limit error, causing the test suite to fail.
- **Root Cause**:
  Under Docker on Linux kernels with cgroups v2, spawning thousands of child processes simultaneously rapidly exhausts the allocated PID limit (`--pids-limit=64`) while each spawned process allocates minimum thread memory. As processes block trying to fork, the kernel cgroup OOM killer simultaneously triggers and issues `SIGKILL` (exit code 137). The runner's classifier initially checked only for OOM strings or explicit exit code 1.
- **Corrective Fix**:
  Refined `classifySandboxOutcome` in `apps/judge-worker/src/sandbox/runner.ts` and updated `apps/judge-worker/tests/safety-suite.integration.test.ts` to recognize exit code 137 under fork-bomb conditions as valid cgroup containment while independently asserting that host PIDs were unaffected and no rogue processes escaped.
- **Lesson Learned**:
  Kernel-level resource limits (PIDs, memory, CPU) interact under extreme attacks. Containment assertions should verify the security property (the host remained uncompromised and the container was killed) rather than assuming a single deterministic exit code.

---

## 2. SSE Subscriber Race Condition on Initial Connection

- **Symptoms**: In fast submissions (e.g. tiny programs evaluated in <200ms), clients connecting to `GET /api/submissions/:id/live` occasionally missed the `COMPLETED` verdict and remained stuck in `RUNNING`.
- **Root Cause**:
  In early implementations, the HTTP route handler queried PostgreSQL for the current submission snapshot _before_ registering the client into the Redis Pub/Sub subscription map. When evaluation finished between the database read and client registration, the terminal Redis Pub/Sub message was published to zero listeners, and the client never received the final verdict.
- **Corrective Fix**:
  Implemented pre-registration with client-side event buffering in `apps/api/src/events/sse.ts`:
  1. The client is registered with `ready = false` and an empty event buffer before the DB query begins.
  2. Any Redis events received while the DB query is in-flight are appended to the buffer.
  3. Once the database snapshot is written to the HTTP stream, the buffer is drained in monotonic order (`QUEUED < RUNNING < terminal`), ensuring zero missed events.
- **Lesson Learned**:
  Always subscribe to the live event stream _before_ capturing the initial state snapshot, and buffer in-flight messages until the snapshot is safely flushed.

---

## 3. Redis Downtime Causing Authentication Outage (Fail-Closed Lockout)

- **Symptoms**: When Redis was stopped or restarted for maintenance, all user login requests (`POST /api/auth/login`) failed with HTTP `500 Internal Server Error`, locking out legitimate users even though PostgreSQL was healthy.
- **Root Cause**:
  The brute-force login protection middleware (`checkLoginLockout`) awaited Redis commands without error handling. When Redis was down, the unhandled connection rejection propagated to the global error handler.
- **Corrective Fix**:
  Implemented a fail-open circuit breaker in `apps/api/src/modules/auth/auth.service.ts`:
  Wrapped Redis operations in a `try/catch` block checking `isRedisHealthy()`. If Redis is offline, the service logs a warning and allows the login attempt to proceed directly to PostgreSQL password verification.
- **Lesson Learned**:
  Protective layers (rate limits, abuse detection) must never become a single point of failure that brings down core business functionality. Always design fail-open or graceful degradation paths for secondary caches.

---

## 4. Test Suite Redis Leaderboard Accumulation Across Runs

- **Symptoms**: During Day 22 integration testing, `apps/api/tests/problems-visibility.integration.test.ts` and `apps/api/tests/postgres.integration.test.ts` failed asserting that a newly solved problem appeared in the first two pages of the global leaderboard.
- **Root Cause**:
  Repeated integration test runs created unique test users and called `leaderboardService.recordSolve()`. Because Redis was not completely flushed between runs to protect other test data, `judge:leaderboard:global` accumulated 220+ entries. Paginating only pages 1 and 2 (limit 100 each) retrieved only the top 200 users, pushing the new test user to page 3.
- **Corrective Fix**:
  Updated the integration test assertions to inspect `pagination.totalPages` dynamically and retrieve all pages before asserting presence:
  ```typescript
  const page1 = await leaderboardService.getGlobalLeaderboard({ page: 1, limit: 100 });
  const allEntries = [...page1.leaderboard];
  for (let p = 2; p <= page1.pagination.totalPages; p++) {
    const nextPage = await leaderboardService.getGlobalLeaderboard({ page: p, limit: 100 });
    allEntries.push(...nextPage.leaderboard);
  }
  ```
- **Lesson Learned**:
  Hardcoded pagination assumptions in integration tests against persistent stores will inevitably break as data accumulates. Tests must paginate through total pages dynamically or isolate namespaces per run.

---

## 5. Queue Enqueue Failure Causing Orphaned `QUEUED` Rows

- **Symptoms**: If Redis ran out of memory or BullMQ rejected a job during high concurrency, submissions appeared in PostgreSQL as `QUEUED` indefinitely and were never picked up by any worker.
- **Root Cause**:
  The submission creation service inserted a `QUEUED` row into PostgreSQL and then called `judgeQueue.add()`. If `judgeQueue.add()` threw an error, the HTTP request returned an error, but the database row remained committed.
- **Corrective Fix**:
  Implemented a compensating transaction in `apps/api/src/modules/submissions/submissions.service.ts`:
  ```typescript
  try {
    await judgeQueue.add('judge-submission', jobData);
  } catch (queueErr) {
    // Compensate by deleting the orphaned database record
    await db
      .delete(submissions)
      .where(eq(submissions.id, submission.id))
      .catch(() => {});
    throw new AppError(ERROR_CODES.QUEUE_UNAVAILABLE, 'Judging service unavailable', 503);
  }
  ```
- **Lesson Learned**:
  When coordinating writes between a relational database and a message broker without distributed 2PC, always implement immediate compensating rollbacks in the error handler.

---

## 6. PostgreSQL Connection Pool Exhaustion During Concurrent Tests

- **Symptoms**: Running parallel integration tests resulted in `Error: timeout exceeded when trying to connect to the database` or stalled test runners.
- **Root Cause**:
  The default `node-postgres` `Pool` allowed unlimited connection attempts without a strict timeout, and multiple test files running concurrently each spawned independent connection pools without terminating them in `afterAll()`.
- **Corrective Fix**:
  1. Configured explicit pool bounds in `apps/api/src/db/index.ts`:
     `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.
  2. Implemented `closeDatabase()` and ensured every integration test calls it in `afterAll()`.
- **Lesson Learned**:
  Connection pools must always have explicit maximums, connection acquisition timeouts, and deterministic lifecycle teardown hooks in test suites.
