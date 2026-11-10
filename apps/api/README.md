# Online Code Judge API (`@judge/api`)

Express + TypeScript REST API and Server-Sent Events (SSE) backend for the Online Code Judge platform.

## Folder Structure

```
src/
├── config/       # Zod environment validation, DB/Redis/MinIO/Queue config
├── events/       # Server-Sent Events (SSE) stream & Redis Pub/Sub wiring
├── middleware/   # Auth, RBAC, rate limiters, request logging, error handler
├── modules/      # Feature modules (auth, users, problems, submissions, etc.)
├── routes/       # Express route registration
├── services/     # Service exports
├── types/        # Backend TypeScript row & domain types
├── utils/        # AppError, Pino logger, Prometheus metrics
├── app.ts        # Express app configuration (/, /health/live, JSON, errors)
└── server.ts     # HTTP server bootstrap and graceful shutdown
```

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm dev:api
pnpm --filter @judge/api typecheck
pnpm --filter @judge/api build
```

## Endpoints Verified for Day 2

- `GET /` — Returns API metadata (`Online Code Judge API`, version, health path) using `@judge/shared`.
- `GET /health/live` — Liveness probe returning `{ status: "ok", service: "@judge/api", uptime, timestamp }`.

## Environment Configuration

Validated with Zod in `src/config/env.ts`. See root `.env.example` for `API_PORT`, `FRONTEND_URL`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, and MinIO settings.
