# Online Code Judge (`@judge/frontend`)

React + TypeScript + Vite web application for the Online Code Judge platform.

> **Note:** Named `apps/frontend` (instead of `apps/web`) to align with the Day 1 architecture documentation and Vite/API proxy conventions.

## Folder Structure

```
src/
├── components/   # Reusable UI components (Header, etc.)
├── hooks/        # Custom React hooks (useHealthCheck)
├── layouts/      # Page layout wrappers (MainLayout)
├── pages/        # Top-level page views (HomePage)
├── services/     # Axios HTTP clients
├── styles/       # Global styles and Tailwind CSS entry
├── types/        # Frontend TypeScript types (re-exporting @judge/shared)
├── utils/        # Classname and formatting utilities
├── App.tsx       # Root React component
└── main.tsx      # React DOM mount point
```

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm dev:frontend
```

Or inside `apps/frontend`:

```powershell
pnpm dev
pnpm typecheck
pnpm build
```

## Implemented Today (Day 2 & Day 11)

- Vite + React 18 + TypeScript (strict) + Tailwind CSS + React Router + TanStack React Query foundation.
- Responsive `MainLayout` and `HomePage` titled **Online Code Judge**, plus `Header` auth navigation and `Sign out` flow.
- Centralized Axios client (`src/services/apiClient.ts`, `src/services/authApi.ts`) with `withCredentials: true` for HTTP-only cookies and global `401` session-expiration handling (never storing JWTs in `localStorage`/`sessionStorage`).
- `AuthProvider` (`src/context/AuthContext.tsx`) bootstrapping via `GET /api/auth/me` (distinguishing `401` unauthenticated from temporary network errors), `LoginPage`, `RegisterPage` (client-side validation, never sending `role`), protected `DashboardPage`, and `ProtectedRoute`.
- Logout (`POST /api/auth/logout`) clearing in-memory user state and user-specific React Query caches (`['auth']`, `['user']`, `['submissions']`) while leaving public problem caches intact.
- **Problem List & Problem Details (Day 13)**:
  - Public routes `/problems` (`ProblemsPage`) and `/problems/:id` (`ProblemDetailPage`, supporting UUID or slug) wired via `src/services/problemsApi.ts` (`GET /api/problems`, `GET /api/problems/:id`) and `@tanstack/react-query` with `AbortSignal` request cancellation.
  - Debounced search (`300ms` via `useDebouncedValue`), `difficulty` and `tag` AND-filters, cursor-based Previous/Next pagination using `nextCursor` (resetting cursors whenever filters/search change), and loading/empty/error/404-not-found UI states.
  - Safe plain-text rendering of problem statements and sample I/O (`whitespace-pre-wrap`, zero `dangerouslySetInnerHTML`) with zero hidden test-case or storage field exposure.
- **API Client Reliability, Monaco Editor, Run Sample & Official Submit + Live SSE (Day 14–16)**:
  - Enhanced `src/services/apiClient.ts` with `classifyApiError()` (`400`/`401`/`403`/`404`/`429`/`500+`/timeout/network/cancelled), single-event `401` session-expiration deduplication (never treating `403` or network errors as `401`), and `getWithRetry()` for safe idempotent `GET` requests respecting `AbortSignal`.
  - Integrated `@monaco-editor/react` (`src/components/CodeEditor.tsx`) and `src/components/SampleRunnerPanel.tsx` into `ProblemDetailPage` for JavaScript & Python with per-language code preservation, reset confirmation dialog, `Run Sample`, and official `Submit` (`POST /api/submissions` -> `202` -> primary `EventSource('/api/submissions/:id/live', { withCredentials: true })` with automatic bounded polling fallback, connection state indicator, `Check Status` recovery, and cleanup on terminal verdict/unmount/navigation).
- Automated frontend auth, problem, sample-runner, official-submit, and SSE tests (`pnpm --filter @judge/frontend test`).

## Intentionally Postponed

- Full submission history page, leaderboards, contests, and admin views.
