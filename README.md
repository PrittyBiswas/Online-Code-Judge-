# Online Code Judge

A local-first, full-stack Online Code Judge platform built with a **pnpm** + **TypeScript** monorepo. Users read problems, write JavaScript in the browser, submit solutions, and receive live verdicts (`ACCEPTED`, `WRONG_ANSWER`, `TIME_LIMIT_EXCEEDED`, etc.) executed inside isolated, throw-away Docker sandboxes.

---

## Project Structure

```text
online-code-judge/
├── apps/
│   ├── api/            # Express + TypeScript REST API & SSE server
│   ├── frontend/       # React + Vite + TypeScript web UI (Day 1 naming kept over apps/web)
│   ├── judge-worker/   # Host-run TypeScript worker (runs outside Docker Compose)
│   ├── cron/           # Scheduled background jobs & recovery sweepers
│   └── stub-mail/      # Local-only mock HTTP email gateway
├── packages/
│   └── shared/         # Shared TypeScript types, Zod schemas, constants, pure utilities
├── attack-suite/       # Hostile test programs for sandbox verification
├── docs/               # Architecture, safety rules, changelog, learning notes, checklist
├── drizzle/            # Database schema & SQL migrations (used in later days)
├── infrastructure/     # Sandbox Dockerfile, Postgres init, helper scripts
├── scripts/            # Environment validation, dev orchestration, seed scripts
├── .env.example        # Safe placeholder environment variables template
├── .editorconfig       # Cross-editor indentation and newline rules
├── .prettierrc         # Code formatting rules
├── eslint.config.js    # ESLint flat config for TypeScript and React
├── package.json        # Root workspace scripts & shared devDependencies
├── pnpm-workspace.yaml # Workspace package globs (apps/*, packages/*)
└── tsconfig.base.json  # Strict TypeScript compiler baseline
```

---

## Technology Stack

| Layer                         | Choice                         | Why                                                                       |
| :---------------------------- | :----------------------------- | :------------------------------------------------------------------------ |
| **Runtime & Package Manager** | Node.js 20+ LTS, pnpm          | Fast workspace linking (`workspace:*`), strict dependency isolation       |
| **Language**                  | TypeScript (`strict: true`)    | End-to-end type safety across API, frontend, worker, and shared contracts |
| **Backend API**               | Express + Zod + Pino           | Minimal, explicit middleware pipeline with runtime request/env validation |
| **Frontend Web**              | React 18 + Vite + Tailwind CSS | Fast HMR dev server, responsive UI, Monaco editor support                 |
| **Database & Storage**        | PostgreSQL + Drizzle, MinIO    | Relational state + S3-compatible storage for test case files              |
| **Queue & Cache**             | Redis + BullMQ                 | Rate limiting, leaderboards (sorted sets), Pub/Sub for SSE, job queue     |
| **Testing & Quality**         | Vitest, ESLint, Prettier       | Fast TS-native unit/integration tests + uniform linting and formatting    |

---

## Prerequisites

- **Node.js** `>= 20.0.0` (Node 20 LTS recommended; pinned in `.nvmrc`)
- **pnpm** `>= 9.0.0`
- **Docker Desktop** (for Day 3+ supporting services and sandbox runs; not required for Day 2)

---

## Getting Started (Windows PowerShell)

### 1. Install Dependencies

```powershell
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` for local development (never commit `.env`):

```powershell
Copy-Item .env.example .env
pnpm env:validate
```

### 3. Build Shared Package & Check Types

```powershell
pnpm build:shared
pnpm typecheck
```

### 4. Start Applications in Development Mode

Run the API and Frontend together:

```powershell
pnpm dev
```

Or start each app independently in separate terminals:

```powershell
pnpm dev:api        # Express API on http://localhost:4000
pnpm dev:frontend   # React + Vite on http://localhost:5173
pnpm dev:worker     # Host-run Judge Worker
pnpm dev:cron       # Background Scheduler
pnpm dev:mail       # Local Stub Mail on http://localhost:4005
```

### 5. Verify Quality & Tests

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

---

## Day 2 Status: What Is Implemented vs. Postponed

### Implemented (Monorepo Foundation)

- pnpm monorepo workspace (`apps/*`, `packages/*`) with `workspace:*` linking.
- Strict `tsconfig.base.json`, ESLint (TypeScript + React), Prettier, `.editorconfig`, `.gitignore`, `.env.example`.
- Working Express API (`GET /`, `GET /health/live`, Zod env validation, error-handling middleware).
- Working React + Vite frontend (`apps/frontend`) with responsive `MainLayout` and **Online Code Judge** home page.
- Shared `@judge/shared` package imported cleanly by both API and Frontend.
- Host-run `apps/judge-worker` kept strictly separate from Docker Compose (no mounted Docker socket).

### Intentionally Postponed (Upcoming Days)

- Live PostgreSQL + Drizzle database migrations and queries.
- Authentication flows, MinIO test case uploads, BullMQ submission judging, SSE streaming, leaderboards, and contests.
- Live Docker Compose service orchestration for Day 3+.

---

## Documentation

- [`docs/safety.md`](docs/safety.md) — Non-negotiable sandbox security rules & Docker flags.
- [`docs/learning-notes.md`](docs/learning-notes.md) — Day 1 foundational concept checks.
- [`docs/project-checklist.md`](docs/project-checklist.md) — Milestone progress tracker.
- [`docs/changelog.md`](docs/changelog.md) — Versioned change history.
- [`docs/known-issues.md`](docs/known-issues.md) — Assumptions and known environment caveats.
