# Stub Mail Service (`@judge/stub-mail`)

Local-only HTTP mock email gateway used to simulate notification delivery without connecting to any external email provider.

## Purpose

- Provides `POST /mail/send` to log simulated notification emails during local development.
- Provides `POST /mail/set-failure-rate` so notification consumers can test retries, exponential backoff, and dead-letter queues under simulated failures.

## Development Commands

From the repository root (PowerShell):

```powershell
pnpm dev:mail
pnpm --filter @judge/stub-mail typecheck
pnpm --filter @judge/stub-mail build
```

Default port: `4005` (configurable via `STUB_MAIL_PORT`).

## Implemented Today (Day 2)

- Express server skeleton with `/mail/send` and `/mail/set-failure-rate`, strict TypeScript config, and workspace setup.

## Intentionally Postponed

- Kafka consumer integration that triggers notification emails on first-time `ACCEPTED` solves (Tier 2).
