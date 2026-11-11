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
