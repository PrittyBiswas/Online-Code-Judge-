# Online Code Judge — Production Deployment & Operations Guide

This guide describes the complete procedure for deploying, operating, monitoring, and maintaining the **Online Code Judge** platform in a production environment.

---

## 1. System Architecture & Prerequisites

### Architecture Overview

The platform consists of the following microservices and data stores:

- **Web Frontend (`@judge/frontend`)**: React 18 SPA served via Nginx 1.27 Alpine with gzip and security headers.
- **Backend API (`@judge/api`)**: Node.js 20 Express server handling REST endpoints, authentication, contests, and live SSE event streams.
- **Judge Worker (`@judge/worker`)**: BullMQ asynchronous consumer that pulls code submissions from Redis, retrieves test cases from MinIO/S3, and executes user code in isolated Docker sandbox containers.
- **PostgreSQL 16**: Relational database storing users, problems, testcases, submissions, contests, and notifications.
- **Redis 7**: In-memory store powering BullMQ job queues, caching, rate limiting, and pub/sub event distribution.
- **MinIO / S3 Object Storage**: S3-compatible storage storing large problem test cases.

### Host System Requirements

- **OS**: Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9 recommended) or Windows Server with WSL2 / Docker Desktop.
- **CPU**: 4+ vCPUs recommended for concurrent sandbox execution.
- **Memory**: 8 GB+ RAM (minimum 4 GB).
- **Disk**: 50 GB+ SSD storage.
- **Docker Engine**: Docker 24.0+ with Compose v2 (`docker compose`).
- **Node.js**: v20.x LTS (if running bare-metal or managing builds).
- **Package Manager**: `pnpm` v9.0+ (`corepack enable && corepack prepare pnpm@12.18.0 --activate`).

---

## 2. Environment Configuration & Secret Generation

All production settings are configured via environment variables.

### Generating Cryptographic Secrets

Before deploying, generate strong 256-bit random secrets for JWT tokens, session cookies, and database passwords:

```bash
# Generate JWT Secret (min 32 characters)
openssl rand -hex 32

# Generate Cookie Secret (min 32 characters)
openssl rand -hex 32

# Generate Database Password
openssl rand -base64 24

# Generate MinIO Root Password
openssl rand -base64 24
```

### Production `.env` Example

Create a `.env` file in the root deployment directory:

```ini
NODE_ENV=production
LOG_LEVEL=info

# Routing & Ports
PORT=4000
PROD_PORT=80
FRONTEND_URL=https://judge.example.com

# PostgreSQL
POSTGRES_USER=judge_admin
POSTGRES_PASSWORD=<SECURE_GENERATED_POSTGRES_PASSWORD>
POSTGRES_DB=judge_production
DATABASE_URL=postgresql://judge_admin:<SECURE_GENERATED_POSTGRES_PASSWORD>@postgres:5432/judge_production

# Redis
REDIS_URL=redis://redis:6379

# MinIO / Object Storage
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ROOT_USER=judge_s3_admin
MINIO_ROOT_PASSWORD=<SECURE_GENERATED_MINIO_PASSWORD>
MINIO_BUCKET_NAME=judge-testcases
MINIO_USE_SSL=false

# Authentication & Cookies
JWT_SECRET=<SECURE_GENERATED_32_CHAR_JWT_SECRET>
COOKIE_SECRET=<SECURE_GENERATED_32_CHAR_COOKIE_SECRET>
AUTH_COOKIE_NAME=token
JWT_EXPIRES_IN=15m

# Worker & Sandbox
WORKER_CONCURRENCY=4
SANDBOX_TIMEOUT_MS=2000
SANDBOX_MEMORY_LIMIT_MB=128
```

> **Security Rule**: The application will automatically fail to start in production if `JWT_SECRET` contains `dev-only` or `change-me`, if `COOKIE_SECRET` is left as default, or if default database credentials are used.

---

## 3. Database Migrations

Apply database migrations before launching production traffic:

```bash
# 1. Start core data stores
docker compose -f docker-compose.prod.yml up -d postgres redis minio create-buckets

# 2. Run Drizzle migrations
pnpm db:migrate

# 3. Verify database schema status
pnpm db:verify
```

---

## 4. Production Deployment with Docker Compose

Deploy the entire production stack using `docker-compose.prod.yml`:

```bash
# Build and start all services in detached mode
docker compose -f docker-compose.prod.yml up -d --build

# Verify all containers are running and healthy
docker compose -f docker-compose.prod.yml ps
```

Expected output:

- `judge_prod_postgres`: healthy
- `judge_prod_redis`: healthy
- `judge_prod_minio`: healthy
- `judge_prod_api`: healthy (health check via `http://localhost:4000/health/live`)
- `judge_prod_worker`: running (monitors BullMQ queue `submission-queue`)
- `judge_prod_frontend`: running (serving port 80 / 443)

---

## 5. Health Checks & Observability

### Health Check Probes

The API exposes standardized health endpoints for load balancers and orchestrators (e.g. Kubernetes, AWS ALB):

| Endpoint                | Probe Type          | Checks                                        | Typical Response                          |
| :---------------------- | :------------------ | :-------------------------------------------- | :---------------------------------------- |
| `GET /health/live`      | **Liveness Probe**  | Process responsiveness, uptime                | `200 OK` `{"status":"ok","uptime":123.4}` |
| `GET /health/ready`     | **Readiness Probe** | PostgreSQL & Redis connectivity (bounded 2s)  | `200 OK` or `503 Degraded`                |
| `GET /health`           | **Standard Probe**  | Alias to readiness probe                      | `200 OK` or `503 Degraded`                |
| `GET /health/extensive` | **Diagnostics**     | Postgres, Redis, MinIO, Docker engine         | `200 OK` with subsystem statuses          |
| `GET /metrics`          | **Prometheus**      | Request counts, latencies, active connections | Prometheus exposition text                |

### Structured Logging & Redaction

All services emit structured JSON logs using Pino:

- Timestamps are formatted in ISO 8601 (`pino.stdTimeFunctions.isoTime`).
- Sensitive data is automatically redacted (`[REDACTED]`) before logging:
  - `authorization` and `cookie` headers
  - `password`, `token`, `refreshToken`
  - `secret`, `secretKey`, `jwtSecret`, `cookieSecret`
  - User submission `code` and hidden test inputs/outputs
- Log outputs can be collected by Vector, Promtail, or FluentBit into Loki or Elasticsearch.

---

## 6. Graceful Shutdown & Zero-Downtime Operations

### Graceful Termination Order

When `SIGTERM` or `SIGINT` is received by `@judge/api`:

1. Active SSE connections (`contestSseManager` and `sseManager`) receive a terminal `event: close` with message `Server shutting down` and are ended.
2. The HTTP server stops accepting new connections and finishes processing in-flight HTTP requests.
3. PostgreSQL connection pool is drained and closed (`closeDatabase()`).
4. Redis client and subscriber connections are closed.
5. If clean shutdown is not completed within 10 seconds, a fallback timeout forcefully terminates the process to prevent hanging pods.

### Worker Graceful Shutdown & Zombie Cleanup

When `SIGTERM` is received by `@judge/worker`:

1. BullMQ stops picking up new jobs from Redis.
2. In-flight jobs are allowed to finish within `WORKER_LOCK_DURATION_MS`.
3. Active sandbox containers are forcefully terminated and removed via `WorkerLifecycle.cleanupActiveContainers()`.
4. On startup, `WorkerLifecycle.pruneOrphanedContainers()` automatically purges any orphaned `judge-sandbox-*` containers from prior abnormal node crashes.

---

## 7. Backup and Restore Procedures

### PostgreSQL Database Backup

```bash
# Create compressed SQL dump
docker exec -t judge_prod_postgres pg_dump -U judge_admin judge_production | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore database from backup
gunzip < backup_20261116_120000.sql.gz | docker exec -i judge_prod_postgres psql -U judge_admin -d judge_production
```

### Redis Backup (AOF / RDB)

Redis is configured with `--appendonly yes`.

- Data is persisted in the `redis_data` volume at `/data/appendonlydir` and `/data/dump.rdb`.
- Trigger manual snapshot: `docker exec judge_prod_redis redis-cli BGSAVE`.

### MinIO Test Cases Backup

```bash
# Mirror test case bucket to local archive
docker exec judge_prod_minio_init mc mirror local/judge-testcases /backup/judge-testcases
```

---

## 8. Rollback Procedures

If an issue occurs after a release:

1. **Revert Docker Images**: Update image tags in `docker-compose.prod.yml` to the previous known good commit.
2. **Re-deploy Containers**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps api worker frontend
   ```
3. **Database Rollback**: If a migration broke compatibility, run down migrations or restore the pre-deployment database snapshot.
4. **Flush Transient Redis Caches**:
   ```bash
   docker exec judge_prod_redis redis-cli --scan --pattern "cache:*" | xargs -r docker exec judge_prod_redis redis-cli DEL
   ```

---

## 9. Troubleshooting Common Issues

### 1. API Readiness Returns 503 Degraded

- Check if PostgreSQL is accepting connections:
  `docker exec judge_prod_postgres pg_isready -U judge_admin -d judge_production`
- Check Redis responsiveness:
  `docker exec judge_prod_redis redis-cli ping`
- Inspect API logs:
  `docker logs --tail 100 judge_prod_api`

### 2. Submissions Stuck in QUEUED Status

- Check if worker is running:
  `docker compose -f docker-compose.prod.yml ps worker`
- Check BullMQ stalled jobs in worker logs:
  `docker logs --tail 200 judge_prod_worker`
- Verify Docker socket access: ensure `/var/run/docker.sock` is mounted in worker container.

### 3. High Memory Usage / Stale Containers

- Execute orphan container sweep:
  `docker ps -a --filter "name=judge-sandbox-"`
  `docker rm -f $(docker ps -aq --filter "name=judge-sandbox-")`
