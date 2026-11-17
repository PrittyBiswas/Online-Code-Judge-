# Online Code Judge — Production Deployment Guide

This guide describes how to deploy, configure, and operate the Online Code Judge platform in production.

---

## 1. System Requirements & Architecture

### Recommended Hardware (Minimum Production Node):

- **CPU:** 4 vCPUs (x86_64 or ARM64)
- **RAM:** 8 GB Memory
- **Disk:** 50 GB SSD
- **OS:** Ubuntu 22.04 LTS / Debian 12 / RHEL 9
- **Container Runtime:** Docker Engine 24+ and Docker Compose v2+

### Service Topology:

1. **Nginx Reverse Proxy** (Port 80/443): SSL termination, static asset delivery, `/api/` proxying, SSE buffering disablement.
2. **Frontend Web App** (`@judge/frontend`): Static React 18 SPA served by Nginx.
3. **Backend API** (`@judge/api`): Node.js 20 Express service listening on port 4000.
4. **Judge Worker** (`@judge/worker`): BullMQ queue consumer with mounted `/var/run/docker.sock` to spawn execution sandboxes.
5. **Cron Service** (`@judge/cron`): Background jobs for stale submission cleanup and contest transitions.
6. **PostgreSQL 16**: Relational storage for users, problems, submissions, and contests.
7. **Redis 7**: BullMQ queues, caching, leaderboard sorted sets, and Pub/Sub.
8. **MinIO / S3 Object Storage**: Storage for problem test case inputs and expected outputs.

---

## 2. Environment Configuration

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Generate secure secrets:

   ```bash
   # Generate JWT and Cookie secrets (minimum 32 characters)
   openssl rand -hex 32
   ```

3. Configure essential production variables in `.env`:

   ```ini
   NODE_ENV=production
   PORT=4000
   API_URL=https://judge.example.com
   FRONTEND_URL=https://judge.example.com

   # Database
   POSTGRES_USER=judge_admin
   POSTGRES_PASSWORD=your_ultra_secure_db_password
   POSTGRES_DB=judge_prod
   POSTGRES_PORT=5432
   DATABASE_URL=postgresql://judge_admin:your_ultra_secure_db_password@postgres:5432/judge_prod

   # Redis
   REDIS_URL=redis://redis:6379

   # MinIO
   MINIO_ROOT_USER=minio_admin
   MINIO_ROOT_PASSWORD=your_ultra_secure_minio_password
   MINIO_BUCKET_NAME=judge-testcases
   MINIO_ENDPOINT=minio
   MINIO_PORT=9000

   # Security
   JWT_SECRET=your_generated_32char_hex_jwt_secret
   COOKIE_SECRET=your_generated_32char_hex_cookie_secret
   ```

4. Validate the environment configuration:
   ```bash
   pnpm env:validate
   ```

---

## 3. Database Migrations

Apply database migrations using Drizzle ORM before starting application services:

```bash
# Run SQL migrations
pnpm db:migrate

# Verify schema integrity
pnpm db:verify
```

---

## 4. Production Deployment with Docker Compose

Build and start all containerized services using the production compose configuration:

```bash
# Build production Docker images
docker compose -f docker-compose.prod.yml build

# Start services in detached mode
docker compose -f docker-compose.prod.yml up -d

# Verify all containers are healthy
docker compose -f docker-compose.prod.yml ps
```

---

## 5. Judge Worker Docker Socket Permissions

The worker container requires access to `/var/run/docker.sock` to orchestrate isolated compiler and runner sandboxes:

```bash
# Ensure docker socket is owned by docker group
sudo chown root:docker /var/run/docker.sock

# If running worker directly on the host, ensure user belongs to docker group:
sudo usermod -aG docker $USER
```

---

## 6. Health Checks & Monitoring

The API provides standardized health probes for container orchestrators (Kubernetes / Docker Swarm):

- **Liveness Probe:** `GET /health/live`
  - Validates that the Node.js event loop is responsive.
- **Readiness Probe:** `GET /health/ready`
  - Verifies live connectivity to PostgreSQL, Redis, and MinIO.
- **Prometheus Metrics:** `GET /health/metrics`
  - Exports process and HTTP metrics for Prometheus scrapers.

---

## 7. Scaling the Platform

- **API Layer:** The `@judge/api` service is completely stateless and can be scaled horizontally behind Nginx or a cloud load balancer.
- **Worker Layer:** Multiple `@judge/worker` instances can be deployed on different nodes with access to their local Docker engines. BullMQ will automatically distribute execution jobs across all active workers.
