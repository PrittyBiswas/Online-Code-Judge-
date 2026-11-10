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

## Implemented Today (Day 2)

- Vite + React 18 + TypeScript (strict) + Tailwind CSS foundation.
- Responsive `MainLayout` and `HomePage` titled **Online Code Judge**.
- Workspace import from `@judge/shared` verified.
- Dev proxy forwarding `/api` and `/health` to `http://localhost:4000`.

## Intentionally Postponed

- Login / Register screens and protected routes.
- Problem list, statement viewer, and Monaco code editor.
- Live SSE submission updates, leaderboards, contests, and admin views.
