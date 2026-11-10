# Shared Package (`@judge/shared`)

Common TypeScript contracts, constants, Zod validation schemas, and pure utilities shared across `apps/api`, `apps/frontend`, `apps/judge-worker`, and `apps/cron`.

## Structure

```
src/
├── constants/    # APP_INFO, resource limits, Redis keys, queue names, error codes
├── schemas/      # Shared Zod schemas (auth, problems, submissions, contests)
├── types/        # Shared enums (Role, Verdict, SubmissionStatus) & DTO interfaces
├── utils/        # Pure cross-platform helpers (output comparator, score encoder)
└── index.ts      # Package entry point
```

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm build:shared
pnpm --filter @judge/shared typecheck
```

## Rules

- Keep only platform-agnostic TypeScript types, Zod schemas, constants, and pure utilities here.
- Never place backend-only (Express, fs, child_process) or frontend-only (React, DOM) code in this package.
