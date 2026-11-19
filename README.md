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

A comprehensive overview of the monorepo workspace, package boundaries, directory hierarchy, and component roles:

```text
online-code-judge/
├── apps/
│   ├── api/                                    # Express + TypeScript REST API & SSE Server (Port 4000)
│   │   ├── src/
│   │   │   ├── config/                         # Environment, Redis, MinIO, and database connections
│   │   │   │   ├── env.ts                      # Strict environment schema validation with Zod
│   │   │   │   ├── redis.ts                    # ioredis client with health check & auto-reconnect
│   │   │   │   └── minio.ts                    # S3-compatible test-case object store client
│   │   │   ├── db/                             # Relational database persistence layer
│   │   │   │   ├── index.ts                    # Drizzle ORM client & PostgreSQL connection pool
│   │   │   │   └── schema.ts                   # Drizzle schema (users, problems, testCases, submissions, contests, notifications)
│   │   │   ├── events/                         # Real-time event streaming
│   │   │   │   ├── sse.ts                      # Server-Sent Events live submission stream with monotonic state progression
│   │   │   │   └── contest-sse.ts              # Real-time contest scoreboard SSE broadcaster
│   │   │   ├── middleware/                     # HTTP pipeline middleware
│   │   │   │   ├── auth.ts                     # JWT authentication & session extraction
│   │   │   │   ├── rbac.ts                     # Fail-closed role-based access control (ADMIN, PROBLEM_SETTER, USER)
│   │   │   │   ├── rate-limiter.ts             # Redis sliding-window IP and user rate limiting
│   │   │   │   └── error-handler.ts            # Centralized API error handler & status mapper
│   │   │   ├── modules/                        # Domain-driven feature modules (controller, service, routes)
│   │   │   │   ├── admin/                      # Administrative management & moderation
│   │   │   │   ├── analytics/                  # User performance metrics, accuracy gauges, 52-week heatmap
│   │   │   │   ├── auth/                       # Registration, login with Redis lockout, password hashing
│   │   │   │   ├── contests/                   # Contest scheduling, participation windows, scoreboard freeze
│   │   │   │   ├── leaderboard/                # Redis Sorted Set rankings with composite scoring & tie-breaking
│   │   │   │   ├── notifications/              # In-app alerts, unread counts, verdict event notifications
│   │   │   │   ├── problems/                   # PostgreSQL GIN full-text search, versioned Redis cache, CRUD
│   │   │   │   ├── submissions/                # Official submission ingestion, sample runs, source inspector
│   │   │   │   └── users/                      # User profile management and statistics
│   │   │   ├── routes/                         # Central API router aggregation (/api/v1)
│   │   │   └── server.ts                       # Express application bootstrap & graceful shutdown hooks
│   │   ├── tests/                              # API unit & integration test suites
│   │   ├── Dockerfile                          # Production multi-stage Docker build
│   │   └── tsconfig.json                       # API TypeScript compiler configuration
│   │
│   ├── frontend/                               # React 18 + Vite + TypeScript Web Client (Port 5173)
│   │   ├── src/
│   │   │   ├── components/                     # Reusable UI component library
│   │   │   │   ├── analytics/                  # Stat cards, difficulty breakdown, language usage & verdict charts, activity heatmap
│   │   │   │   ├── submissions/                # Filterable submission table, source viewer modal, verdict badges
│   │   │   │   ├── workspace/                  # Three-panel split layout, drag dividers, problem statement renderer
│   │   │   │   ├── CodeEditor.tsx              # Monaco Editor integration with language syntax & local autosave
│   │   │   │   ├── SampleRunnerPanel.tsx       # Interactive test-case runner with custom input support & stdout/stderr display
│   │   │   │   ├── CreateContestModal.tsx      # Modal for creating contests with time-window controls
│   │   │   │   ├── Header.tsx                  # Global navbar with live user stats, navigation, and theme toggles
│   │   │   │   ├── NotificationBell.tsx        # Notification center drawer with real-time unread badges
│   │   │   │   └── ProtectedRoute.tsx          # Route guard ensuring authentication and role authorization
│   │   │   ├── context/                        # React Context providers (AuthContext, ThemeContext)
│   │   │   ├── hooks/                          # Custom React hooks (useAuth, useSubmissionLive, useDebounce)
│   │   │   ├── pages/                          # Application page views
│   │   │   │   ├── HomePage.tsx                # Welcome landing page with platform highlights
│   │   │   │   ├── ProblemsPage.tsx            # Problem bank with difficulty, tag filters, and search
│   │   │   │   ├── ProblemDetailPage.tsx       # Advanced three-panel coding workspace
│   │   │   │   ├── SubmissionHistoryPage.tsx   # Filterable user submission log
│   │   │   │   ├── SubmissionDetailsPage.tsx   # Submission code inspector with execution metrics
│   │   │   │   ├── AnalyticsPage.tsx           # Dedicated user performance and insights dashboard
│   │   │   │   ├── ContestsPage.tsx            # Active, upcoming, and past contests directory
│   │   │   │   ├── ContestDetailPage.tsx       # Live contest workspace & scoreboard with freeze window
│   │   │   │   ├── LeaderboardPage.tsx         # Global competitive leaderboard
│   │   │   │   ├── ProfilePage.tsx             # User profile, solved problems breakdown, settings
│   │   │   │   ├── AdminProblemsPage.tsx       # Admin problem catalogue & management
│   │   │   │   ├── AdminProblemFormPage.tsx    # Problem creator/editor with Markdown preview & testcase uploads
│   │   │   │   ├── LoginPage.tsx               # Login page with validation and lockout feedback
│   │   │   │   ├── RegisterPage.tsx            # User registration with password security criteria
│   │   │   │   └── DashboardPage.tsx           # User summary dashboard
│   │   │   ├── services/                       # Typed HTTP API client and SSE stream managers
│   │   │   ├── types/                          # Frontend-specific UI and state types
│   │   │   └── main.tsx                        # React application DOM mount & router setup
│   │   ├── Dockerfile                          # Production Nginx container build
│   │   └── vite.config.ts                      # Vite build configuration & development proxies
│   │
│   ├── judge-worker/                           # Host-Run Code Execution Worker (BullMQ + Docker Sandbox)
│   │   ├── src/
│   │   │   ├── config/                         # Worker environment, Redis queue connections, MinIO client
│   │   │   ├── db/                             # Direct PostgreSQL connection for verdict persistence
│   │   │   ├── evaluator/                      # Output verification, whitespace normalization, float tolerance
│   │   │   ├── processor/                      # BullMQ queue consumers (official submissions & interactive sample runs)
│   │   │   ├── recovery/                       # Sweeper recovering abandoned RUNNING jobs after worker restarts
│   │   │   ├── sandbox/                        # Hardened Docker execution runner
│   │   │   │   ├── runner.ts                   # Container lifecycle, resource quotas, security flags enforcement
│   │   │   │   └── types.ts                    # Sandbox execution options, limits, and runtime outcomes
│   │   │   ├── storage/                        # MinIO S3 SigV4 client for downloading hidden test cases
│   │   │   └── index.ts                        # Worker process initialization & graceful shutdown
│   │   └── Dockerfile                          # Production worker Dockerfile
│   │
│   ├── cron/                                   # Background Scheduler & Maintenance Worker
│   │   └── src/                                # Lockout cleanup, contest phase transitions, abandoned job sweepers
│   │
│   └── stub-mail/                              # Local-Only Mock Email Gateway
│       └── src/                                # Local mock HTTP email delivery & inspection endpoints
│
├── packages/
│   └── shared/                                 # Centralized TypeScript Contracts (Single Source of Truth)
│       └── src/
│           ├── constants/                      # Global limits, Redis key generators, HTTP error codes
│           ├── schemas/                        # Zod runtime validation schemas for all inputs & API requests
│           ├── types/                          # Shared domain interfaces (Problem, Submission, Contest, User, Verdict)
│           └── utils/                          # Pure helper functions (cursor encoding, verdict mappers)
│
├── attack-suite/                               # Adversarial Sandbox Security Verification Suite
│   ├── fork-bomb/                              # SAFE-01: Process bomb containment verification (PID limits)
│   ├── infinite-loop/                          # SAFE-02: Hard wall-clock CPU timeout enforcement (SIGKILL)
│   ├── memory-bomb/                            # SAFE-03: Cgroup memory exhaustion (OOM killer containment)
│   ├── network-attempt/                        # SAFE-04: Network isolation verification (--network none)
│   ├── privilege-check/                        # SAFE-05: Non-root execution verification (user 1000:1000, cap-drop)
│   ├── file-access/                            # SAFE-06: Read-only root filesystem verification (--read-only)
│   ├── output-flood/                           # SAFE-07: Excessive stdout truncation and memory protection
│   ├── stderr-flood/                           # SAFE-08: Excessive stderr truncation and logging protection
│   ├── env-secret-probe/                       # SAFE-09: Environment variable confidentiality verification
│   └── tmp-escape/                             # SAFE-10: Tmpfs boundary and filesystem escape defenses
│
├── drizzle/                                    # Database Migrations & Schemas
│   ├── meta/                                   # Drizzle schema snapshot history
│   └── 0000_*.sql                              # Versioned SQL migration files
│
├── infrastructure/                             # Containerization & Deployment Orchestration
│   ├── docker/                                 # Multi-service Docker definitions
│   │   ├── sandbox/                            # Multi-language sandbox runtime (Node, Python, Java, Go, Rust)
│   │   ├── sandbox-gcc/                        # GCC/G++ sandbox runtime for high-performance C and C++
│   │   ├── api/                                # Backend API production container
│   │   ├── frontend/                           # Frontend Nginx production container
│   │   └── postgres/                           # PostgreSQL initialization scripts
│   ├── docker-compose.yml                      # Local development infrastructure (Postgres, Redis, MinIO)
│   └── docker-compose.prod.yml                 # Production multi-container composition
│
├── scripts/                                    # Developer Tooling & Verification Automation
│   ├── data/                                   # Seed problem banks & reference solutions
│   ├── seed.ts                                 # Database seeder: 50 real problems & 350 starter-code templates
│   ├── verify-350-starter-code.ts              # Automated verifier for all 7 languages across 50 problems
│   ├── verify-environment.ts                   # Pre-flight environment sanity checks
│   ├── verify-infrastructure.ts                # Live verification for PostgreSQL, Redis, and MinIO connectivity
│   └── dev.ts                                  # Monorepo multi-service dev runner
│
├── docs/                                       # Comprehensive Architectural & Operational Documentation
│   ├── architecture.md                         # End-to-end architecture diagrams & data flow sequence charts
│   ├── API.md                                  # REST endpoints, SSE streams, request/response contracts
│   ├── SECURITY.md                             # Threat model, sandbox containment, and authentication security
│   ├── decisions.md                            # Architectural Decision Records (ADR-001 through ADR-010)
│   ├── pattern-notes.md                        # 13 distributed systems and architectural pattern cards
│   ├── runbook.md                              # Operational runbook for start-up, maintenance, and incident recovery
│   ├── failure-report.md                       # Post-mortem root-cause analyses of 6 engineering edge cases
│   ├── acceptance-map.md                       # Milestone acceptance verification matrix
│   ├── deployment-guide.md                     # Production deployment and Nginx reverse proxy setup
│   └── test-plan.md                            # Complete unit, integration, and security test matrix
│
├── .env.example                                # Safe development environment variables template
├── .editorconfig                               # Uniform cross-editor indentation and newline configuration
├── .prettierrc                                 # Code style rules (singleQuote, trailingComma, tabWidth 2)
├── eslint.config.js                            # Unified flat ESLint rules for TypeScript & React
├── pnpm-workspace.yaml                         # Workspace package declarations (apps/*, packages/*)
├── tsconfig.base.json                          # Strict base TypeScript compiler configuration
└── package.json                                # Workspace root scripts, dependencies, and tooling
```

### Component Details & Architectural Breakdown

#### 1. Frontend Web Client (`apps/frontend`)

- **Technology**: React 18, Vite, Tailwind CSS, Monaco Editor, Lucide Icons.
- **Workspace Engine**: Advanced three-panel layout (`apps/frontend/src/components/workspace`) featuring draggable split dividers, dynamic problem statement rendering with LaTeX math and code formatting, custom input tester, and live execution verdict console.
- **Code Editor**: Monaco Code Editor (`CodeEditor.tsx`) customized with 7 programming languages, syntax highlighting, theme switching, automatic local storage drafts, and starter code reset.
- **Real-Time Streaming**: Native `EventSource` SSE client (`apps/frontend/src/services/api.ts`) listening to `/api/submissions/:id/live` with automated retry, monotonic status progression, and polling fallback.
- **Analytics**: Dedicated `/analytics` dashboard (`apps/frontend/src/pages/AnalyticsPage.tsx`) rendering SVG accuracy gauges, difficulty progress bars, verdict distribution charts, language breakdown, and an interactive 52-week activity calendar heatmap.

#### 2. Backend API Service (`apps/api`)

- **Technology**: Express, TypeScript, Drizzle ORM, Zod, Pino Logger, ioredis.
- **Domain Modules**: Structured in clean controller-service-route layers across `problems`, `submissions`, `contests`, `leaderboard`, `analytics`, `notifications`, `auth`, `users`, and `admin`.
- **Database & Caching**: PostgreSQL connection pool managed via Drizzle ORM; multi-tier caching using Redis Cache-Aside for problem details, versioned list caching for problem catalogs, and Redis Sorted Sets for global and contest leaderboards.
- **Security & Authorization**: Strict HttpOnly `SameSite=Lax` cookies, fail-closed RBAC middleware (`requireRole`), fail-open Redis brute-force login lockout (`apps/api/src/middleware/rate-limiter.ts`), and sanitized database query parameters.

#### 3. Judge Worker & Execution Sandbox (`apps/judge-worker`)

- **Technology**: Node.js, BullMQ, Docker SDK / CLI, MinIO S3 SDK.
- **Queue Architecture**: Consumes two independent BullMQ queues: `judge-queue` (official submissions with persistent storage) and `sample-run-queue` (ephemeral interactive tests).
- **Multi-Language Runtimes**: Supports 7 programming languages:
  - **JavaScript**: Node.js 20 LTS
  - **Python**: Python 3.11
  - **C**: GCC with `-O2 -std=c11`
  - **C++**: G++ with `-O2 -std=c++17`
  - **Java**: OpenJDK 17
  - **Go**: Go 1.21
  - **Rust**: Rustc 1.75 with `-O`
- **Hardened Sandbox Isolation**: Each execution spawns a clean, disposable Docker container with rigorous security parameters:
  - `--network none`: Complete network lockout preventing data exfiltration or SSRF.
  - `--read-only`: Read-only root filesystem preventing malware persistence.
  - `--tmpfs /tmp:rw,noexec,nosuid,size=64m`: In-memory isolated temporary scratch space.
  - `--user 1000:1000`: Unprivileged non-root execution.
  - `--cap-drop ALL`: Removal of all Linux capabilities.
  - `--pids-limit 64`: Strict process count cap to neutralize fork bombs.
  - `--memory / --cpus`: Strict hardware boundary enforcement per problem limits.
- **Test Case Verification**: MinIO hidden test cases are downloaded via AWS SigV4 authenticated URLs, executed against the submission with fail-fast evaluation, and outputs are compared with whitespace-insensitive and float-tolerant comparison algorithms.

#### 4. Shared Domain Contracts (`packages/shared`)

- **Purpose**: Serves as the single source of truth across API, frontend, worker, and cron services.
- **Type Safety**: Shared domain models (`Problem`, `Submission`, `User`, `Contest`, `Verdict`, `SupportedLanguage`) eliminate drift between database entities and client state.
- **Runtime Validation**: Reusable Zod schemas validate all API inputs, mutation payloads, query parameters, and Redis cache payloads before execution.

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
- **Docker Desktop** (for supporting services and sandbox runs )

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

### 3. Start Local Infrastructure

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

### 4. Configure Database & Apply Drizzle Migrations 

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
