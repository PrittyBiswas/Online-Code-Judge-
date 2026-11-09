# @judge/api

Express REST API and Server-Sent Events (SSE) server for the Online Code Judge platform.

## Architecture

- **Auth & RBAC**: JWT in HTTP-only cookies (`AC-ID-01`), account lockout in Redis with atomic counters (`AC-ID-02`), fail-open when Redis is stopped (`AC-ID-04`), default-deny role checks (`AC-ID-03`).
- **Problems**: CRUD for setters/admins, MinIO object storage for test case files (`AC-PR-01`), hidden test cases never leaked (`AC-PR-02`), full-text search with ranking and AND filters (`AC-PR-03`), cursor pagination (`AC-PR-04`), Redis cache-aside with invalidation (`AC-PR-05`).
- **Submissions**: Validates size & language, returns `202 Accepted` immediately (`AC-SJ-01`), 5/min rate limit (`AC-SJ-10`), double-click guard (`AC-SJ-11`), Monaco editor sample "Run" box (`AC-FE-04`).
- **Live Updates**: Server-Sent Events (`/api/submissions/:id/live`) connected via Redis Pub/Sub (`AC-LV-01..04`).
- **Observability**: Prometheus metrics at `/metrics` (`AC-OP-02`), JSON logging via Pino with submission tracing (`AC-OP-01`), health checks at `/health/live` and `/health/extensive` (`AC-OP-04`).

