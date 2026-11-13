# Week 1 Concept Check & Learning Notes

These notes address the core foundational concepts required for the Online Code Judge architecture.

---

### 1. What a Docker container is, and how it differs from a virtual machine

A **Docker container** is a lightweight, isolated user space process running directly on the host operating system's kernel. Containers use Linux kernel isolation primitives—specifically **namespaces** (which isolate what a process can see: PID, network, mount points) and **cgroups** (control groups, which constrain how much resource a process can consume: CPU, memory, I/O).

In contrast, a **Virtual Machine (VM)** includes an entire guest operating system running on top of a hypervisor, simulating hardware. Containers share the host kernel, start in milliseconds, and consume minimal RAM, making them ideal for running high-frequency, throwaway code executions.

---

### 2. What `--network none`, `--memory`, `--pids-limit`, and `--read-only` do

- **`--network none`**: Disables all networking inside the container (no external internet access, no local Docker network access, only the loopback interface). Untrusted code cannot perform network requests or scan host services.
- **`--memory` & `--memory-swap`**: Sets an upper bound on RAM usage. When combined with equal swap (`--memory-swap equal to --memory`), any process exceeding this limit is immediately terminated by the Linux OOM killer (`SIGKILL`, exit code 137).
- **`--pids-limit`**: Restricts the maximum number of simultaneous processes that can be spawned in the container, completely preventing fork-bomb denial-of-service attacks.
- **`--read-only`**: Mounts the container's root filesystem in read-only mode, preventing malicious code from modifying binaries, dropping permanent scripts, or creating files outside explicitly designated temporary scratch volumes.

---

### 3. Why running untrusted code on your host is dangerous, and why mounting the Docker socket is as bad as giving root

Running untrusted code directly on your host operating system gives arbitrary code full access to read private user files, delete databases, access `.env` credentials, execute malware, and pivot across the local network.

Mounting the **Docker socket (`/var/run/docker.sock`)** inside a container gives whatever process controls that socket direct access to the Docker daemon. Because the Docker daemon runs with root privileges on the host, a container with Docker socket access can spawn a privileged container that mounts the host's root filesystem (`/`) and execute commands as root on the host machine. Therefore, giving a container access to the Docker socket is equivalent to giving root access to the entire host.

---

### 4. What a message queue is and why a judge uses one

A **message queue** (such as BullMQ over Redis) is an asynchronous FIFO/priority buffer that decouples the frontend/API layer from backend processing workers.

A code judge uses a message queue because compiling and running code takes variable amounts of time (e.g., 1–5 seconds per test). If the API handled execution synchronously, HTTP connections would hang, worker threads would block, and the server would crash under concurrent user submissions. With a message queue, the API immediately validates the submission, stores it as `QUEUED`, pushes a job into the queue, and responds instantly with `202 Accepted`. Background workers then pull jobs at a controlled, safe concurrency rate.

---

### 5. What Redis is, its data types, why TTLs matter, and what INCR and sorted sets do

**Redis** is an in-memory key-value data structure store used as a database, cache, message broker, and queue.

- **Data Types**: Strings, Hashes, Lists, Sets, and Sorted Sets.
- **TTLs (Time-To-Live)**: Expiration timers attached to keys. They ensure temporary data (e.g., rate-limiting counters, auth lockouts, cached problem details) automatically clean themselves up without scheduled deletion queries.
- **`INCR`**: An atomic operation that increments a numeric value in Redis without race conditions. Used for rate limit counters.
- **Sorted Sets (`ZADD`, `ZREVRANGE`)**: Collections of unique elements where each element has an associated floating-point score. Redis maintains them in sorted order with $O(\log N)$ updates and $O(\log N + M)$ range queries, making them the perfect engine for real-time leaderboards.

---

### 6. What a database transaction is, and what idempotent means with an example

- **Database Transaction**: A group of one or more SQL operations executed as a single atomic unit satisfying ACID properties (Atomicity, Consistency, Isolation, Durability). Either all operations succeed (commit) or all are reverted (rollback).
- **Idempotence**: A property where an operation can be executed multiple times without changing the result beyond the initial execution ($f(f(x)) = f(x)$).
  - _Example in the Judge_: A submission worker receiving the same BullMQ job twice due to network retries updates the verdict with a conditional query: `UPDATE submissions SET status = 'ACCEPTED' WHERE id = :id AND status IN ('QUEUED', 'RUNNING');`. The second update affects 0 rows and avoids double-crediting leaderboard points.

---

### 7. fetch vs Axios, useEffect (dependency array and cleanup), Promises and async/await

- **`fetch` vs `Axios`**: Native `fetch` does not reject on HTTP 4xx/5xx status codes and requires manual `.json()` parsing. `Axios` automatically parses JSON, rejects promises on HTTP error codes, provides request/response interceptors (essential for automatic 401 JWT refresh), and supports request cancellation.
- **`useEffect`**: Synchronizes a React component with an external system. The dependency array dictates when it re-runs (empty `[]` = on mount only). The returned cleanup function runs before re-execution or unmount, preventing memory and connection leaks (e.g., closing SSE streams).
- **Promises & async/await**: A `Promise` represents a value that will resolve or reject in the future. `async/await` is syntactic sugar over promises that allows writing asynchronous non-blocking code in a clean, synchronous style with `try/catch`.

---

### 8. Hashing vs encryption, how to store passwords, and what is inside a JWT

- **Hashing vs Encryption**: Encryption is a two-way function (reversible using a secret decryption key). Hashing is a one-way cryptographic function (irreversible).
- **Storing Passwords**: Passwords must never be encrypted; they must always be **hashed using a salted, slow key-derivation function** like **`bcrypt`** or `Argon2` with high work factors to prevent rainbow-table and brute-force attacks.
- **Inside a JWT**: A JSON Web Token consists of three base64url-encoded parts separated by dots:
  1. _Header_: Algorithm (e.g., HS256) and token type.
  2. _Payload_: Claims (user ID, role, issued-at, expiration).
  3. _Signature_: Cryptographic signature generated by hashing `header + payload` with a server secret to prevent tampering.

---

### 9. What Server-Sent Events are and how they differ from polling and WebSockets

- **Server-Sent Events (SSE)**: A lightweight, standard HTTP technology where the client initiates a persistent connection (`Accept: text/event-stream`), and the server pushes unidirectional data events to the client over standard HTTP.
- **Comparison**:
  - _Short/Long Polling_: Client repeatedly opens new HTTP requests every second to ask "is it done yet?", generating massive network overhead and server load.
  - _WebSockets_: Full-duplex (bidirectional) connection using a custom protocol (`ws://`). More complex to manage through firewalls and proxies, and unnecessary when data only flows one way (from judge to browser).
  - _SSE Advantage_: Unidirectional, runs over standard HTTP, natively handles automatic reconnection, and works out of the box with browser `EventSource`.

---

### 10. Drizzle ORM, Schemas, Migrations, Foreign Keys & Indexes (Day 4)

1. **What Drizzle ORM is**
   **Drizzle ORM** is a lightweight, TypeScript-first SQL toolkit and Object-Relational Mapper. Instead of writing raw string SQL queries manually or generating heavy runtime classes, you define your PostgreSQL tables directly in TypeScript (`apps/api/src/db/schema.ts`), and Drizzle gives you type-checked query builders (`db.select()`, `db.insert()`, `db.delete()`) plus `drizzle-kit` for generating SQL migrations.

2. **Why an ORM is useful**
   - **Compile-time safety**: If you misspell a column name or pass a string where PostgreSQL expects a number, TypeScript catches the bug before the server even starts.
   - **Parameterized queries**: Drizzle automatically binds user values safely as SQL parameters, preventing SQL injection vulnerabilities.
   - **Cleaner mapping**: Database rows map directly into strongly typed TypeScript records without boilerplate parsing.

3. **What a database schema is**
   A **database schema** is the formal blueprint of your database structure: which tables exist (`users`, `problems`, `test_cases`, `submissions`), what columns and data types each table holds (`uuid`, `varchar`, `integer`, `timestamptz`), which values are required (`NOT NULL`) or unique (`UNIQUE`), and how tables relate to one another.

4. **What database migrations are**
   A **database migration** is a versioned, repeatable SQL script (stored in `drizzle/migrations/`) that evolves a database from one schema state to the next without losing existing data. `drizzle-kit generate` compares your TypeScript schema against previous snapshots to create the next SQL file, and `drizzle-kit migrate` records and runs unapplied migrations in PostgreSQL (`drizzle.__drizzle_migrations`).

5. **Why foreign keys and indexes are important**
   - **Foreign keys** enforce _referential integrity_ at the database level — for example, preventing a submission from referencing a non-existent `problem_id` or `user_id`, and controlling cleanup behavior (`ON DELETE CASCADE` for test cases/submissions, `ON DELETE RESTRICT` to prevent accidentally deleting a user who authored problems).
   - **Indexes** (like B-tree indexes on `problems.slug`, `submissions(user_id, created_at, id)`, and `test_cases(problem_id, index)`) let PostgreSQL locate rows quickly without scanning the entire table as submissions and problems grow.

---

### 11. CRUD, Drizzle Queries, API-to-DB Communication, Parameterized Queries, Transactions & Testing (Day 5)

1. **What CRUD means**
   **CRUD** stands for the four basic operations performed on persistent data:
   - **Create**: Adding a new row (e.g., registering a user, creating a problem, submitting code).
   - **Read**: Fetching one or many rows (e.g., loading a user profile, fetching a problem by slug, listing a user's submissions).
   - **Update**: Modifying an existing row (e.g., editing a problem's limits, updating a submission status from `QUEUED` to `COMPLETED`).
   - **Delete**: Removing a row (e.g., removing a problem and cascading its `test_cases`).

2. **How Drizzle ORM performs database operations**
   Instead of manually building fragile SQL strings, Drizzle exposes type-checked methods mapped directly to your TypeScript schema (`db.select().from(problems).where(...)`, `db.insert(users).values(...).returning()`, `db.update(...).set(...)`, `db.delete(...)`). Under the hood, Drizzle compiles those calls into SQL and sends them over our `pg.Pool` connection in `apps/api/src/db/index.ts`.

3. **How API services communicate with PostgreSQL**
   When an HTTP request arrives at Express (`routes` -> `controller`), the controller validates input with Zod and calls a **service** (`authService`, `usersService`, `problemsService`, `submissionsService`). The service uses Drizzle's `db` client (backed by a reusable connection pool in PostgreSQL) to execute queries, maps database records cleanly into safe API DTOs (stripping fields like `passwordHash`), and translates Postgres driver errors (like duplicate keys `23505` or bad foreign keys `23503`) into clean HTTP errors via `mapDatabaseError`.

4. **Why parameterized queries are important**
   Parameterized queries separate **SQL structure** from **user-supplied values** (e.g., `WHERE slug = $1` with parameter `['two-sum']`). Even if an attacker sends `' OR 1=1 --` as a username or search string, PostgreSQL treats it strictly as plain text rather than executable SQL, completely preventing **SQL injection** attacks.

5. **What database transactions do**
   A **database transaction** (`db.transaction(async (tx) => { ... })`) wraps multiple queries into a single all-or-nothing step. When creating a problem with multiple test cases, if inserting the `test_cases` fails, PostgreSQL automatically **rolls back** the `problems` insert too — guaranteeing you never end up with half-saved, broken records.

6. **The difference between unit tests and integration tests**
   - **Unit tests** (`pnpm test`) test service rules (like password hashing, validation, cursor logic, and hidden test filtering) fast and offline using mocked database dependencies.
   - **Integration tests** (`pnpm test:integration`) run against the **real PostgreSQL database** (and real HTTP routes) to prove that SQL queries, transactions, unique constraints, foreign keys, and cleanup actually work end-to-end.

---

### 12. Judge Engine Testing, Edge Cases & Sandbox Verification (Day 8)

1. **Output Comparison Rules (`normalizeOutput` / `compareOutputs`)**
   - Normalizes `\r\n` to `\n`, strips null bytes (`\0`), trims trailing spaces/tabs per line, and strips trailing empty/whitespace-only lines while strictly preserving **leading** whitespace, **internal** tabs/multiple spaces, and Unicode characters.
2. **Edge Cases & Malformed Input Guards**
   - Programs producing empty output (`process.exit(0)` / `sys.exit(0)`), large piped inputs (>64 KB OS pipe buffer), Unicode + `CRLF`, hidden multi-test redaction (`isHidden: true` omits inputs/expected/actual outputs), and corrupted/null BullMQ payloads or empty source code must fail safely without leaving rows stuck in `RUNNING`.
3. **Bugs Found & Fixed During Day 8 Testing**
   - **Exit codes `125`/`126`/`127` ambiguity (`apps/judge-worker/src/sandbox/runner.ts`)**: User programs exiting with `process.exit(127)` or `sys.exit(125)` were previously misclassified as `SANDBOX_CONTAINER_START_FAILED` (`INTERNAL_ERROR`). Fixed by checking for runtime bootstrap markers (`__JUDGE_MEMORY_KB:` / `__JUDGE_COMPILE_ERROR__`) before classifying exit codes `125`/`126`/`127` as container startup errors.
   - **Async Redis SSE subscription (`apps/api/src/events/sse.ts`)**: `SSEManager` previously checked `isRedisHealthy()` synchronously at module import time and missed subscribing if Redis finished connecting asynchronously after startup. Fixed by attaching a `'ready'` listener on `redisSubscriber` so SSE always subscribes reliably.
   - **Corrupted/empty worker payloads (`apps/judge-worker/src/processor/judgeProcessor.ts`)**: Safely guarded null/non-object payloads, empty/whitespace source code, and missing test/problem cases via a shared permanent-failure helper that saves `INTERNAL_ERROR`, publishes the terminal SSE event, and throws `PermanentWorkerError`.
   - **Leaderboard score encoding (`packages/shared/src/utils/score.ts`)**: Fixed `decodeLeaderboardScore(0)` returning `10,000,000` penalty on uninitialized users (`rawScore === null`) and fixed `encodeLeaderboardScore(1, 0)` off-by-one overflow (`20,000,000` decoding as `2` solved instead of `1`) using `MAX_PENALTY = PENALTY_OFFSET - 1`.

---

### 13. Container Security Boundaries & Attack Suite (`SAFE-01` to `SAFE-09`, Day 9)

1. **Why `--sysctl net.ipv4.ip_unprivileged_port_start=1024` matters on WSL2**
   - On Docker Desktop (WSL2), Linux network namespaces default `ip_unprivileged_port_start` to `0`, allowing non-root UID `1000` to bind port `80` inside its isolated namespace. Explicitly setting `--sysctl net.ipv4.ip_unprivileged_port_start=1024` restores standard Linux unprivileged port restrictions so privileged binds fail with `EACCES`.
2. **Why `CapEff: 0000000000000000` and `NoNewPrivs: 1` matter**
   - Dropping all Linux capabilities (`--cap-drop ALL`) removes kernel privileges such as raw sockets or mounting filesystems, while `--security-opt no-new-privileges` ensures even setuid binaries (`su`, `sudo`) cannot grant elevated privileges.
3. **Why exit code `137` must not blindly mean `MEMORY_LIMIT_EXCEEDED`**
   - Linux exit code `137` (`128 + 9`) simply means the process received `SIGKILL`. An external wall-clock timeout (`docker kill`), an output-limit kill, or an external `SIGKILL` all produce `137`. Checking `timedOut`, `execFileTimedOut`, `outputExceeded`, runtime OOM errors, and `oomKilled` ensures `TLE`, `OLE`, `RUNTIME_ERROR`, and `MLE` are distinguished accurately.

---

### 14. Secure Cookie Authentication, Password Hashing & RBAC (Day 10)

1. **Why JWTs belong in `HttpOnly` cookies instead of JSON responses**
   - Returning a JWT in JSON encourages storing it in `localStorage`, where any XSS script can read and steal it. Storing the JWT only in an `HttpOnly`, `SameSite=Lax` cookie prevents JavaScript (`document.cookie`) from accessing the token.
2. **Why `register` must never accept `role` from the client**
   - Trusting client-supplied `role: "admin"` allows trivial privilege escalation. Public registration must always assign the lowest-privilege role (`user`) on the server; elevated roles (`problem_setter`, `admin`) must only be granted via trusted server-side administration.
3. **Why `requireAuth` re-checks PostgreSQL**
   - A signed JWT remains cryptographically valid until it expires even if the user was deleted or demoted. Querying `users` by `decoded.id` ensures deleted accounts immediately get `401 Unauthorized` and role changes take effect immediately.

---

### 15. Redis Login Lockout (Fail-Open) & Frontend Auth State (Day 11)

1. **Why Redis login lockout fails open when Redis is unreachable**
   - Brute-force lockout (`5` failures -> `15m` lock) relies on Redis counters (`INCR` + `EXPIRE`). If Redis goes down temporarily, failing closed would lock out every legitimate user on the platform. Failing open skips only the Redis lockout lookup while still enforcing PostgreSQL + `bcrypt` password verification.
2. **Why frontend auth bootstrap distinguishes `401` from network errors**
   - On startup, calling `GET /api/auth/me` with `withCredentials: true` proves whether the browser holds a valid `HttpOnly` cookie (`200` authenticated vs `401` unauthenticated). A temporary network error is surfaced as a retryable connection error instead of falsely marking the user logged out.
3. **Why logout clears user-specific caches cleanly**
   - Even if `POST /api/auth/logout` encounters a network error, clearing in-memory `user` state and user-scoped React Query caches (`['auth']`, `['user']`, `['submissions']`) prevents stale private data from remaining visible while keeping public problem data intact.

---

## Day 12 — PostgreSQL Full-Text Search, Keyset Cursor Pagination & Versioned Redis Cache-Aside

1. **PostgreSQL Full-Text Search (`to_tsvector` + `websearch_to_tsquery` + GIN Index)**
   - Unlike `ILIKE '%term%'` (which scans every row and cannot use a standard B-tree index), PostgreSQL's GIN index (`idx_problems_search_gin`) indexes stemmed English lexemes across `title` and `statement`.
   - `websearch_to_tsquery('english', $search)` safely parses user queries via parameterized queries without throwing syntax errors on punctuation.
2. **Opaque Base64url Keyset Cursor Pagination**
   - Offset pagination (`OFFSET N`) degrades on deep pages and shifts items when rows are inserted. Keyset pagination encodes `(rank, createdAt, id)` in a validated `base64url` cursor and filters with strict tuple comparison (`(created_at, id) < ($cursorDate, $cursorId)`), preventing duplicate or skipped items even when two problems share the exact same timestamp.
3. **Versioned Redis Cache-Aside (Zero `KEYS *` Scans)**
   - Problem details (`judge:cache:problem:<idOrSlug>`) and problem listings (`judge:cache:problems:list:v<version>:<queryHash>`) use cache-aside with TTLs and corrupt-JSON recovery, falling back cleanly to PostgreSQL if Redis is down.
   - Instead of running dangerous `KEYS *` scans on write, mutations atomically `INCR judge:cache:problems:list:version` after the DB transaction commits so all stale search/filter/page caches expire naturally.
4. **Safe MinIO Compensation & Submission-Reference Archival**
   - If `createProblem` uploads test cases to MinIO and the PostgreSQL transaction fails, uploaded MinIO keys are deleted as compensation. If `deleteProblem` finds existing `submissions`, it archives (`is_archived = true`) rather than deleting submission history or MinIO test cases.

---

## Day 13 — Frontend Problem Browsing, Debounced Search & Cursor History

1. **Debounced Search + Stale Request Protection**
   - Debouncing search and tag inputs by `300ms` (`useDebouncedValue`) avoids firing an API request on every keystroke.
   - Using `@tanstack/react-query` `queryKey` scoping (`['problems', queryParams]`) paired with `AbortSignal` forwarded to Axios (`fetchProblems(queryParams, signal)`) cancels superseded requests and guarantees older slow responses never overwrite newer results.
2. **Cursor Stack for Previous / Next Pagination**
   - Because the API uses opaque keyset cursors (`nextCursor`) instead of page numbers, `ProblemsPage` keeps a local `cursorStack` of visited cursors. Clicking **Next** pushes the current cursor and advances to `nextCursor`; clicking **Previous** pops back cleanly, and changing any filter or search resets the stack to page 1.
3. **Safe Text Rendering**
   - Problem statements and sample I/O are rendered strictly as React text nodes (`whitespace-pre-wrap`) inside `<p>` and `<pre><code>`, never `dangerouslySetInnerHTML`, preventing XSS even if a statement contains `<script>` tags.

---

## Day 14 — API Client Reliability, Monaco Editor & Isolated Sample Execution

1. **API Client Reliability Without Refresh Tokens**
   - Because the backend uses a single `HttpOnly` JWT cookie without a refresh-token endpoint, the frontend never invents client-side token storage or fake refresh calls. Instead, `apiClient.ts` deduplicates simultaneous `401` session-expiration notifications, keeps `403` separate, classifies status/network/timeout errors safely, and retries only idempotent `GET` requests when not aborted.
2. **Dedicated `sample-run-queue` vs Official `judge-queue`**
   - Routing sample runs through a separate BullMQ queue (`sample-run-queue`) and `sampleRunProcessor.ts` guarantees sample runs can never enter `processSubmissionJob()`, touch hidden `test_cases`, write `submissions` rows, or update `leaderboard` scores—while still executing inside the exact same host-run Docker sandbox.
3. **Zero Trust for Client Sample Parameters**
   - `runSampleSchema.strict()` accepts only `{ problemId, code, language }`. `sampleInput`, `timeLimitMs`, and `memoryLimitMb` are loaded exclusively from PostgreSQL on the server.

---

## Day 15 — Official Submission Lifecycle, DB Compensation & Bounded Polling

1. **Queue-Failure Compensation (`submitCode`)**
   - PostgreSQL `INSERT` and BullMQ `judgeQueue.add` span two separate systems. If `judgeQueue.add` fails or Redis is down, `submitCode()` deletes the orphaned `QUEUED` submission row and returns `503` rather than leaving a permanently stuck `QUEUED` submission.
2. **Strict Ownership on `GET /api/submissions/:id`**
   - Always check `sub.userId === currentUserId` before returning a submission DTO, preventing horizontal privilege escalation (`IDOR`) from exposing another user's source code.
3. **Bounded Backoff Polling with `AbortController`**
   - When polling `GET /api/submissions/:id`, increasing the delay (`600ms` -> up to `2500ms`), capping total wait (`45s`) and consecutive transient errors (`3`), and aborting on unmount or problem change prevents runaway network traffic and stale UI updates.

---

## Day 16 — Real-Time SSE, Snapshot Buffering & Polling Fallback

1. **Closing the Pub/Sub Snapshot Race Window**
   - Redis Pub/Sub does not replay missed messages. Registering the SSE client in `SSEManager` _before_ querying PostgreSQL (buffering incoming events until the initial DB snapshot is written) ensures transitions happening mid-query are never lost.
2. **Monotonic Status Guards**
   - Tracking `lastRank` (`QUEUED = 0`, `RUNNING = 1`, terminal `COMPLETED`/verdict = `2`) on both backend SSE delivery and frontend `SampleRunnerPanel` guarantees out-of-order or stale events cannot regress `RUNNING` back to `QUEUED`.
3. **Graceful Polling Fallback Without Duplicate Submissions**
   - If `EventSource` is unavailable or fails repeatedly, the UI closes the stream and switches to existing bounded `GET /api/submissions/:id` polling for the same `submissionId`—never re-calling `POST /api/submissions`.

---

## Day 17 — Global Leaderboard Architecture, Deterministic Tie-Breaking & Redis Fallback

1. **Redis Sorted Sets with Single-Float Composite Scoring**
   - Storing user rankings in Redis Sorted Sets (`ZADD`, `ZREVRANGE`) allows $O(\log N)$ updates and $O(\log N + M)$ range retrieval for paginated queries.
   - Encoding both problems solved and penalty seconds into a single floating-point score (`problemsSolved * 10,000,000 + (9,999,999 - boundedPenalty)`) enables Redis to natively sort higher solves first, then break ties by lower penalty time without multiple index lookups.
2. **Deterministic Tie-Breaking & Ordered First-Solve Ingestion**
   - In-memory and PostgreSQL fallback calculations must process accepted submissions ordered strictly by `createdAt ASC, id ASC` (`orderBy(asc(submissions.createdAt), asc(submissions.id))`). This ensures that multiple accepted submissions with identical millisecond timestamps produce deterministic first-solve selection, and duplicate accepted submissions on the same problem never inflate penalty or overwrite the authentic first-solve time.
   - When two users have equal score (identical problems solved and penalty seconds), global secondary sorting by `username ASC` and `userId ASC` ensures rank ordering remains completely deterministic across page boundaries and identical between Redis and PostgreSQL fallback modes.
3. **Resilient Dual-Engine Leaderboard (Redis + PostgreSQL Source of Truth)**
   - Redis serves as a fast read-cache and live leaderboard index, but PostgreSQL remains the durable source of truth. If Redis is unavailable, empty, or fails, the API seamlessly falls back to on-demand aggregation from PostgreSQL `submissions` and `users` without throwing 500 errors to clients.
   - **Atomic Redis Solve Ingestion**: `RECORD_SOLVE_LUA_SCRIPT` validates argument types upfront, checks key types with `TYPE`, verifies `SISMEMBER` to eliminate duplicate solves, and executes `pcall(redis.call, 'ZADD', ...)` with `SREM` rollback compensation to prevent inconsistent state if `ZADD` fails.
   - **Cache Completeness Verification**: Cache metadata status (`judge:leaderboard:meta:status = 'ready'`) prevents expensive O(N) database scans on paginated queries, while bi-directional member set verification (`dbUserIds` vs `redisUserIds`) detects both missing solvers and unexpected extra members.
   - **Concurrency-Safe Rebuild & Atomic Dual-Write Protocol**:
     - **Unified Atomic Lua Script (`RECORD_SOLVE_LUA_SCRIPT`)**: Accepts `solvedSetKey`, `leaderboardKey`, and `rebuildPointerKey`. Atomically executes argument validation, type checking, duplicate solve detection (`SISMEMBER`), user solved set addition (`SADD`), canonical leaderboard score calculation (`ZADD`), and—if a rebuild is currently active—updates the temporary leaderboard and live-solves set (`SADD <tempKey>:livesolves:<userId>`). Eliminates application-level gaps between canonical and temporary writes, preventing race conditions during rebuild publication.
     - **Atomic Leaderboard Key Swap (`SWAP_LEADERBOARD_KEYS_LUA_SCRIPT`)**: Atomically executes `RENAME tempKey canonicalKey` and `DEL judge:leaderboard:rebuilding` in a single Redis transaction, eliminating any window where concurrent solves could recreate an orphaned temporary key.
     - **Active Rebuild Watchdog Pointer Renewal**: Heartbeat watchdog runs every 5000ms checking the rebuild lock token. Upon verifying lock ownership, it atomically renews both `judge:lock:leaderboard:rebuild` and `judge:leaderboard:rebuilding` via `pexpire`, preventing pointer expiration during rebuilds lasting longer than the 30-second TTL.
