# Online Code Judge

A modern, production-ready competitive programming and code execution platform built with a **TypeScript** + **pnpm** monorepo. Users read problems, solve challenges across **7 programming languages** (JavaScript, Python, C, C++, Java, Go, Rust) in an advanced three-panel Monaco workspace, run sample code or custom inputs, inspect submission histories, track their progress on an interactive analytics dashboard, and receive real-time execution verdicts streamed via Server-Sent Events (SSE) from isolated Docker execution sandboxes.

---

## Key Features

- **Multi-Language Compiler & Sandbox**: Secure, isolated execution of JavaScript (Node 20), Python (3.11), C (GCC), C++ (G++), Java (OpenJDK), Go, and Rust inside non-root, read-only Docker containers with strict CPU, memory, PID, and network limits.
- **Advanced Three-Panel Coding Workspace**: Resizable split panels for Problem Statement & Constraints, Monaco Code Editor with language switching and autosave draft recovery, and Sample Runner / Custom Input testcase panel.
- **Persistent JSONB Test Case Results**: Full testcase tracking with hidden testcase sanitization and fail-fast evaluation.
- **Submission History & Source Inspector**: Filter submissions by search (debounced 300ms), verdict, language, and date range; inspect source code with syntax highlighting, copy-to-clipboard, and metrics.
- **Performance Analytics & Insights Dashboard**: Dedicated `/analytics` dashboard featuring accuracy gauges, difficulty progress bars (Easy/Medium/Hard), verdict and language distribution charts, 52-week activity calendar heatmap, and execution runtime trends.
- **Live Leaderboard & Contests**: Real-time scoreboard with Redis sorted sets, penalty calculations, contest windows, and freeze period support.
- **Production-Ready Infrastructure**: Multi-stage Docker production images, health probes (`/health/live`, `/health/ready`), Prometheus metrics, and automated GitHub Actions CI pipeline.

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

### 3. Start Local Infrastructure (Day 3)

Start PostgreSQL, Redis, and MinIO (all bound strictly to `127.0.0.1` with persistent named volumes):

```powershell
docker compose up -d
docker compose ps
pnpm infra:verify
```

Stop infrastructure without deleting persistent volumes:

```powershell
docker compose down
```

See [`docs/infrastructure.md`](docs/infrastructure.md) for health checks, volume safety, and troubleshooting.

### 4. Configure Database & Apply Drizzle Migrations (Day 4)

Ensure `DATABASE_URL` in `.env` matches `POSTGRES_PORT` (for example `5433` if PostgreSQL runs on port `5433`), then run migrations and verify live PostgreSQL read/write checks:

```powershell
pnpm db:migrate
pnpm db:verify
```

When modifying `apps/api/src/db/schema.ts`, generate a new migration first:

```powershell
pnpm db:generate
```

### 5. Build Shared Package & Check Types

```powershell
pnpm build:shared
pnpm typecheck
```

### 6. Start Applications in Development Mode

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

### 7. Verify Quality & Tests

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test              # Offline unit tests
pnpm test:integration  # Live API + Postgres + BullMQ + MinIO + Worker integration tests
pnpm test:safety       # Live Docker sandbox security attack suite (SAFE-01 to SAFE-09)
```

---

## Implementation Status

### Completed Milestones (Days 1–23)

- **Monorepo & Foundations (Days 1–2)**: pnpm monorepo workspace (`apps/*`, `packages/*`) with `workspace:*` linking, strict `tsconfig.base.json`, ESLint, Prettier, `.editorconfig`, and `.gitignore`.
- **Infrastructure (Day 3)**: Docker Compose for PostgreSQL, Redis, and MinIO with persistent volumes, strict `127.0.0.1` binding, and health checks.
- **Relational Storage & Migrations (Days 4–5)**: Drizzle ORM schemas, SQL migrations, relation constraints, indexes, and full transactional CRUD for users, problems, test cases, and submissions.
- **Asynchronous Execution & Sandbox Engine (Days 6–9)**: BullMQ worker queues, MinIO hidden test case retrieval via AWS SigV4, throwaway Docker sandbox isolation (`--network none`, `--read-only`, `--tmpfs`, `--cap-drop ALL`, `--user 1000:1000`), recovery sweeps, and automated adversarial attack suite (`SAFE-01` to `SAFE-09`).
- **Authentication & RBAC (Days 10–11)**: Bcrypt password hashing, HttpOnly `SameSite=Lax` JWT cookies, role-based access control (`ADMIN`, `PROBLEM_SETTER`, `USER`), and fail-open Redis login lockout.
- **Problem Management & Full-Text Search (Days 12–13)**: MinIO test-case upload, PostgreSQL GIN full-text search, cursor-based pagination, React frontend problem browser, and safe Markdown/statement rendering.
- **Interactive Code Editor & Isolated Sample Runs (Day 14)**: Monaco Editor integration, per-language code persistence, dedicated `sample-run-queue` executing in Docker sandbox with client parameter zero-trust.
- **Official Submissions & Live SSE Streaming (Days 15–16)**: Official submission lifecycle, DB failure compensation, authenticated `Server-Sent Events` (`/api/submissions/:id/live`) with pre-snapshot race protection, monotonic status progression, and polling fallback.
- **Global Leaderboard (Day 17)**: Dual-engine leaderboard using Redis Sorted Sets with composite float score (`problemsSolved * 10,000,000 + (9,999,999 - penalty)`), secondary tie-breaking, and PostgreSQL on-demand fallback.
- **Contest Management (Day 18)**: Contests lifecycle (`DRAFT`, `UPCOMING`, `ACTIVE`, `PAST`), participant registration, time window validation, and problem visibility scoping.
- **Live Contest Leaderboard & Scoreboard Freeze (Day 19)**: ACM-ICPC 20-minute penalty scoring, scoreboard freeze window, dual-view (frozen participant view vs live admin view), and real-time SSE updates.
- **Notification System & Reconciliation Sweeper (Day 20)**: Notifications API, user inbox drawer with unread badges, automated verdict notifications, contest announcements, and background sweeper with distributed Redis locking.
- **End-to-End Integration Testing & Regression Hardening (Day 21)**: Comprehensive 8-stage E2E user journey test (`e2e-workflow.integration.test.ts`), safety containment verification, and dynamic pagination boundary hardening.
- **Production Readiness & Observability (Day 22)**: Multi-stage Dockerfiles, Nginx reverse proxy configuration, `docker-compose.prod.yml`, liveness (`/health/live`) and readiness (`/health/ready`) probes, structured JSON logging with secret redaction, and graceful shutdown handlers.
- **Documentation & Code Quality (Day 23)**: Complete system architecture with Mermaid diagrams (`docs/architecture.md`), 10 ADRs (`docs/decisions.md`), 13 Pattern Cards (`docs/pattern-notes.md`), 6 failure post-mortems (`docs/failure-report.md`), operational runbook (`docs/runbook.md`), acceptance map (`docs/acceptance-map.md`), and strict code quality verification.

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — Comprehensive system architecture, component breakdown, and Mermaid sequence diagrams.
- [`docs/decisions.md`](docs/decisions.md) — Architectural Decision Records (ADR-001 through ADR-010).
- [`docs/pattern-notes.md`](docs/pattern-notes.md) — 13 distributed systems and software design pattern cards.
- [`docs/failure-report.md`](docs/failure-report.md) — 6 real-world development failure post-mortems and root-cause analyses.
- [`docs/runbook.md`](docs/runbook.md) — Operational runbook for starting, verifying, troubleshooting, and recovering services.
- [`docs/acceptance-map.md`](docs/acceptance-map.md) — Complete Tier 1 acceptance criteria verification map.
- [`docs/safety.md`](docs/safety.md) — Non-negotiable sandbox security rules, Docker flags & security boundaries.
- [`docs/deployment-guide.md`](docs/deployment-guide.md) — Production deployment instructions and Nginx configuration.
- [`docs/infrastructure.md`](docs/infrastructure.md) — Local Docker Compose infrastructure, volumes, health checks & troubleshooting.
- [`docs/test-plan.md`](docs/test-plan.md) — Security attack suite (`SAFE-01` to `SAFE-09`) and regression test plan.
- [`docs/learning-notes.md`](docs/learning-notes.md) — Core concept notes and technical deep dives across Days 1–23.
- [`docs/project-checklist.md`](docs/project-checklist.md) — Milestone progress tracker across all 23 implementation days.
- [`docs/changelog.md`](docs/changelog.md) — Versioned changelog following Keep a Changelog conventions.
- [`docs/known-issues.md`](docs/known-issues.md) — Assumptions, architectural trade-offs, and environment caveats.
