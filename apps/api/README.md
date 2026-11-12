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

## Endpoints Verified for Day 2

- `GET /` — Returns API metadata (`Online Code Judge API`, version, health path) using `@judge/shared`.
- `GET /health/live` — Liveness probe returning `{ status: "ok", service: "@judge/api", uptime, timestamp }`.

## Environment Configuration

Validated with Zod in `src/config/env.ts` (`JWT_SECRET` is strictly required when `NODE_ENV=production`). See root `.env.example` for `API_PORT`, `FRONTEND_URL`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `AUTH_COOKIE_NAME`, `COOKIE_SECRET`, and MinIO settings.
