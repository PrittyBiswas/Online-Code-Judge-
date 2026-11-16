# Online Code Judge API (`@judge/api`)

Express + TypeScript REST API and Server-Sent Events (SSE) backend for the Online Code Judge platform.

## Folder Structure

```
src/
├── config/       # Zod environment validation, DB/Redis/MinIO/Queue config
├── db/           # Drizzle ORM schema, pg Pool connection, live DB verify script
├── events/       # Server-Sent Events (SSE) stream & Redis Pub/Sub wiring
├── middleware/   # Auth, RBAC, rate limiters, request logging, error handler
├── modules/      # Feature modules (auth, users, problems, submissions, etc.)
├── routes/       # Express route registration
├── services/     # Service exports
├── types/        # Backend TypeScript row & domain types
├── utils/        # AppError, PostgreSQL error mapper (db-error.ts), Pino logger, metrics
├── app.ts        # Express app configuration (/, /health/live, JSON, errors)
└── server.ts     # HTTP server bootstrap and graceful shutdown
```

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm dev:api
pnpm --filter @judge/api typecheck
pnpm --filter @judge/api build
pnpm db:generate
pnpm db:migrate
pnpm db:verify
pnpm test:integration
```

## Authentication & RBAC Endpoints (Day 10)

- `POST /api/auth/register` — Registers a new user (`username`, `email`, `password`), normalizes email, hashes password with `bcrypt`, enforces `role = 'user'` on the server, sets an `HttpOnly` JWT cookie (`token`), and returns `{ data: { user } }` (never returns `token` or `passwordHash`).
- `POST /api/auth/login` — Authenticates via `email` (or `usernameOrEmail`) and `password`, protects against brute-force lockouts, returns a generic `401` on invalid credentials, sets the `HttpOnly` JWT cookie, and returns `{ data: { user } }`.
- `POST /api/auth/logout` — Clears the authentication cookie safely (even if absent) using matching cookie attributes (`httpOnly`, `secure`, `sameSite`, `path`).
- `GET /api/auth/me` — Protected by `requireAuth`; verifies the HTTP-only JWT cookie, confirms the user exists in PostgreSQL, and returns `{ data: { user } }`.
- **RBAC (`requireRole`)**: Deny-by-default role middleware (`401` unauthenticated, `403` insufficient permissions) trusting only server-side roles loaded from PostgreSQL.

## Problem Management, Search, Storage & Caching (Day 12)

- `GET /api/problems` — Public problem listing supporting PostgreSQL Full-Text Search (`search` via `to_tsvector`/`websearch_to_tsquery` + GIN index `idx_problems_search_gin`), AND-combined filtering (`difficulty`, `tag`, `category`), base64url keyset cursor pagination (`cursor`, `limit` 1–50), and versioned Redis cache-aside (`judge:cache:problems:list:v<version>:<hash>`, `120s` TTL). Rejects malformed cursors or unsupported filter keys (`400`).
- `GET /api/problems/:id` — Public problem details (by UUID or slug) cached in Redis (`judge:cache:problem:<idOrSlug>`, `300s` TTL). Never returns hidden test cases, MinIO keys, or credentials.
- `POST /api/problems` — Protected (`requireAuth`, `requireRole(Role.PROBLEM_SETTER, Role.ADMIN)`). Uploads hidden test cases to MinIO/Silo (`judge-testcases`), inserts problem & test-case metadata transactionally, compensates by deleting uploaded MinIO objects on DB failure, and invalidates list caches.
- `PUT /api/problems/:id` — Protected (`requireAuth`, `requireRole(Role.PROBLEM_SETTER, Role.ADMIN)`). Partially updates problem fields and invalidates detail + list caches.
- `DELETE /api/problems/:id` — Protected (`requireAuth`, `requireRole(Role.PROBLEM_SETTER, Role.ADMIN)`). Safely archives (`is_archived = true`) when submissions reference the problem (preserving submissions & MinIO objects), or hard-deletes and cleans up MinIO objects when unreferenced, then invalidates detail + list caches.

## Sample Code Execution Endpoints (Day 14)

- `POST /api/submissions/run-sample` — Protected (`requireAuth`, `sampleRunRateLimiter` 10/min, `sampleDoubleClickGuard`). Validates `{ problemId, code, language }` (`runSampleSchema.strict()`, rejecting client-supplied `customInput`, limits, or image names), loads only public `sampleInput` and problem resource limits from PostgreSQL, stores initial `QUEUED` state in Redis (`judge:sample:job:<runId>`, `300s` TTL), and enqueues `SampleRunJobData` (`type: 'SAMPLE_RUN'`) onto `sample-run-queue` (`attempts: 1`, `removeOnComplete: true`, `removeOnFail: { age: 300, count: 50 }`) for the host `judge-worker`. Returns `202 Accepted` `{ data: { runId, status: 'QUEUED' } }`.
- `GET /api/submissions/run-sample/:runId` — Protected (`requireAuth`). Reads sample run state from Redis, enforces strict job ownership (`403 Forbidden` if another user owns `runId`, `404` if missing/expired), and returns bounded `stdout`/`stderr`, outcome, and execution metrics without exposing source code or internal worker data.

## Official Submission Endpoints (Day 15)

- `POST /api/submissions` — Protected (`requireAuth`, `submissionRateLimiter` 5/min, `doubleClickGuard`). Validates `{ problemId, code, language }`, verifies problem availability in PostgreSQL, inserts a `QUEUED` submission row, and enqueues the job on `judge-queue` (compensating by deleting the row and returning `503` if queue insertion fails). Returns `202 Accepted` `{ data: { id, status: 'QUEUED' } }`.
- `GET /api/submissions/:id` — Protected (`requireAuth`). Enforces strict ownership (`403 Forbidden` if `submission.userId !== req.user.id`, `404` if missing) and returns public submission status, verdict, `executionTimeMs`, `memoryUsedKb`, and `failedTestIndex` without exposing hidden test-case data.
- `GET /api/submissions/:id/live` — Protected (`requireAuth`, `HttpOnly` cookie auth—never query-string JWTs). Enforces `404`/`403` submission ownership, registers SSE client before reading PostgreSQL snapshot (buffering in-flight Redis Pub/Sub events to prevent missed updates), enforces monotonic status ordering (`QUEUED -> RUNNING -> COMPLETED`), sends `15s` heartbeats, closes on terminal verdict or Redis drop, and strips source code/hidden test data (`apps/api/src/events/sse.ts`).

## Global Leaderboard Endpoints (Day 17)

- `GET /api/leaderboard` — Public leaderboard supporting bounded pagination (`page` min 1 default 1, `limit` min 1 max 100 default 50). Ranks users by problems solved descending, ties broken by lower penalty time (seconds), and deterministic tie-breaking (by username/userId). Reads live standings from Redis Sorted Set (`judge:leaderboard:global`) with batch username hydration, automatically falling back to parameterized PostgreSQL queries over `submissions` (`verdict = 'ACCEPTED'`) ordered by `createdAt ASC` when Redis is empty or unhealthy. Only exposes public fields (`rank`, `userId`, `username`, `problemsSolved`, `totalPenaltySeconds`, `score`), redacting emails and hashes. Returns `{ data: { leaderboard, pagination } }`.
- `POST /api/leaderboard/rebuild` — Protected (`requireAuth`, `requireRole(Role.ADMIN)`). Recomputes all user solve counts and penalties from PostgreSQL `submissions` (`ACCEPTED` verdicts), clears and repopulates Redis Sorted Set `judge:leaderboard:global` and user solved sets (`judge:user:<id>:solved`), and returns `{ data: { message, count, rebuiltEntries } }`.

## Contest Management Endpoints (Day 18)

- `POST /api/contests` — Protected (`requireAuth`, `requireRole(Role.PROBLEM_SETTER, Role.ADMIN)`). Creates a contest with `title`, `description`, `startTime`, `endTime`, `freezeTime`, and associated problem IDs.
- `GET /api/contests` — Public contest listing supporting filtering by status (`UPCOMING`, `ACTIVE`, `PAST`) and pagination.
- `GET /api/contests/:id` — Public contest detail view showing status, start/end times, and problem count.
- `POST /api/contests/:id/register` — Protected (`requireAuth`). Registers the authenticated user for the contest. Enforces registration before submissions are allowed.
- `GET /api/contests/:id/problems` — Protected (`requireAuth`). Returns contest problems for registered participants once the contest has started.

## Contest Leaderboard & Scoring Endpoints (Day 19)

- `GET /api/contests/:id/leaderboard` — Returns ACM-ICPC contest standings (problems solved, penalty minutes with 20-min incorrect attempt penalties). Automatically applies scoreboard freeze during `freezeTime <= now < unfreezeTime` for normal participants, while providing live standings to admins/setters.
- `POST /api/contests/:id/freeze` — Protected (`requireAuth`, `requireRole(Role.ADMIN)`). Manually freezes the contest scoreboard.
- `POST /api/contests/:id/unfreeze` — Protected (`requireAuth`, `requireRole(Role.ADMIN)`). Unfreezes the contest scoreboard and recalculates final standings.
- `GET /api/contests/:id/live` — Server-Sent Events stream for live contest leaderboard updates.

## Notification Endpoints (Day 20)

- `GET /api/notifications` — Protected (`requireAuth`). Retrieves paginated notifications for the authenticated user, ordered by creation time descending.
- `PATCH /api/notifications/:id/read` — Protected (`requireAuth`). Marks a single notification as read, enforcing user ownership.
- `POST /api/notifications/read-all` — Protected (`requireAuth`). Marks all notifications as read for the authenticated user.
- `POST /api/notifications/broadcast` — Protected (`requireAuth`, `requireRole(Role.ADMIN)`). Broadcasts an announcement notification to contest participants.

## Health Probes & Observability (Day 22)

- `GET /health/live` — Shallow liveness probe returning `200 OK` indicating the Node.js process is responsive.
- `GET /health/ready` — Deep readiness probe verifying connectivity to PostgreSQL (`SELECT 1`), Redis (`PING`), and MinIO (`listBuckets`). Returns `503 Service Unavailable` if any dependency is degraded.
- **Graceful Shutdown**: Intercepts `SIGTERM` and `SIGINT`, ceases new connection acceptance, drains existing HTTP requests within a 10s grace period, and cleanly terminates database and Redis connection pools.
- **Structured Logging**: Emits machine-readable JSON logs with automatic redaction of sensitive credentials, passwords, tokens, and cookies.

## Environment Configuration

Validated with Zod in `src/config/env.ts` (`JWT_SECRET` is strictly required when `NODE_ENV=production`). See root `.env.example` for `API_PORT`, `FRONTEND_URL`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `AUTH_COOKIE_NAME`, `COOKIE_SECRET`, and MinIO settings.
