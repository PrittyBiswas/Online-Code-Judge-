# Infrastructure Guide (Day 3)

This document describes the local development infrastructure for the **Online Code Judge** platform managed via [`docker-compose.yml`](../docker-compose.yml).

---

## 1. Infrastructure Architecture

The local stack separates stateful backing services (run inside Docker Compose) from the untrusted code-execution worker (run directly on the host OS):

```text
+-------------------------------------------------------------------+
| Host Machine (Windows / macOS / Linux)                            |
|                                                                   |
|  apps/frontend (Vite :5173)  --->  apps/api (Express :4000)       |
|  apps/judge-worker (Host Process, NO Docker socket mounted)       |
|         |                 |                  |                    |
+---------|-----------------|------------------|--------------------+
          | 127.0.0.1:5432  | 127.0.0.1:6379   | 127.0.0.1:9000/9001
          v                 v                  v
+-------------------------------------------------------------------+
| Docker Compose (Localhost-Bound Stateful Services)                |
|                                                                   |
|  +------------------+  +--------------+  +---------------------+  |
|  | judge_postgres   |  | judge_redis  |  | judge_minio         |  |
|  | postgres:16      |  | redis:7      |  | minio/minio         |  |
|  +--------+---------+  +------+-------+  +----------+----------+  |
|           |                   |                     |             |
|    [postgres_data]       [redis_data]          [minio_data]       |
+-------------------------------------------------------------------+
```

**Critical Security Boundary:**

- All Compose ports are explicitly bound to **`127.0.0.1`** (never `0.0.0.0`), preventing network exposure on your LAN or public interfaces.
- **`apps/judge-worker` is intentionally NOT inside `docker-compose.yml`**, and **`/var/run/docker.sock` is never mounted** into any container.

---

## 2. PostgreSQL Configuration

- **Service**: `postgres` (`container_name: judge_postgres`)
- **Image**: `postgres:16-alpine`
- **Restart Policy**: `unless-stopped`
- **Port Binding**: `127.0.0.1:${POSTGRES_PORT:-5432}:5432`
- **Volume**: `postgres_data:/var/lib/postgresql/data`
- **Environment Variables**: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (no credentials hardcoded in Compose; read from `.env`).
- **Note on Schemas**: Day 3 sets up the PostgreSQL engine and persistence only; application schemas and Drizzle migrations belong to later phases.

---

## 3. Redis Configuration

- **Service**: `redis` (`container_name: judge_redis`)
- **Image**: `redis:7-alpine`
- **Command**: `redis-server --appendonly yes` (enables Append-Only File persistence inside `redis_data`)
- **Restart Policy**: `unless-stopped`
- **Port Binding**: `127.0.0.1:${REDIS_PORT:-6379}:6379`
- **Volume**: `redis_data:/data`
- **Application Connection**: Configured via `REDIS_URL=redis://localhost:6379`, consumed by [`apps/api/src/config/redis.ts`](../apps/api/src/config/redis.ts) and [`apps/api/src/config/queue.ts`](../apps/api/src/config/queue.ts).

---

## 4. MinIO Object Storage Configuration

- **Service**: `minio` (`container_name: judge_minio`)
- **Image**: `minio/minio:latest`
- **Server Command**: `server /data --console-address ":9001"`
- **Restart Policy**: `unless-stopped`
- **Port Bindings**:
  - S3 API: `127.0.0.1:${MINIO_API_PORT:-9000}:9000`
  - Web Console: `127.0.0.1:${MINIO_CONSOLE_PORT:-9001}:9001`
- **Volume**: `minio_data:/data`
- **Intended Future Objects**: Submitted source code snapshots, uploaded problem files, test case input/output artifacts, and judge execution outputs.

### Idempotent Bucket Initialization (`create-buckets`)

A companion one-shot container (`judge_minio_init` using `minio/mc:latest`) waits until `minio` passes `condition: service_healthy`, configures the local alias, and runs:

```sh
mc mb --ignore-existing local/${MINIO_BUCKET:-${MINIO_BUCKET_NAME:-judge-testcases}}
```

Using `--ignore-existing` with `restart: "no"` guarantees `docker compose up -d` can be run repeatedly without errors or overwriting existing objects.

---

## 5. Environment Variables

All defaults and local templates live in [`.env.example`](../.env.example). Copy it to `.env` (which is ignored by Git):

| Category       | Variable              | Default / Example                                                       | Purpose                                    |
| :------------- | :-------------------- | :---------------------------------------------------------------------- | :----------------------------------------- |
| **PostgreSQL** | `POSTGRES_DB`         | `judge_db`                                                              | Initial database name                      |
| **PostgreSQL** | `POSTGRES_USER`       | `judge_user`                                                            | Database user                              |
| **PostgreSQL** | `POSTGRES_PASSWORD`   | `judge_secret_password`                                                 | Database password (local dev only)         |
| **PostgreSQL** | `POSTGRES_PORT`       | `5432`                                                                  | Host port bound on `127.0.0.1`             |
| **PostgreSQL** | `DATABASE_URL`        | `postgresql://judge_user:judge_secret_password@localhost:5432/judge_db` | Connection URL for future DB layer         |
| **Redis**      | `REDIS_URL`           | `redis://localhost:6379`                                                | Primary Redis connection URI for API       |
| **Redis**      | `REDIS_PORT`          | `6379`                                                                  | Host port bound on `127.0.0.1`             |
| **MinIO**      | `MINIO_ROOT_USER`     | `minioadmin`                                                            | MinIO root admin username                  |
| **MinIO**      | `MINIO_ROOT_PASSWORD` | `minioadmin`                                                            | MinIO root admin password                  |
| **MinIO**      | `MINIO_API_PORT`      | `9000`                                                                  | S3 API port bound on `127.0.0.1`           |
| **MinIO**      | `MINIO_CONSOLE_PORT`  | `9001`                                                                  | Web Console port bound on `127.0.0.1`      |
| **MinIO**      | `MINIO_BUCKET_NAME`   | `judge-testcases`                                                       | Default bucket created by `create-buckets` |

Validate local `.env` values anytime with:

```powershell
pnpm env:validate
```

---

## 6. Docker Volumes & Persistence

Three named Docker volumes preserve data across container stops, recreates, and restarts:

- `postgres_data` -> `/var/lib/postgresql/data`
- `redis_data` -> `/data`
- `minio_data` -> `/data`

### Stopping vs. Deleting Volumes

- **Safe normal shutdown (`docker compose down`)**: Stops and removes containers and the Compose network while **preserving named volumes and all data**. Running `docker compose up -d` afterward reattaches existing PostgreSQL databases, Redis AOF files, and MinIO objects.
- **Destructive wipe (`docker compose down -v`)**: **Deletes all named volumes permanently**, destroying databases, Redis state, and MinIO objects. **Never run `docker compose down -v` during routine testing or development.**

---

## 7. Health Checks

| Service    | Command                                                                  | Interval | Timeout | Retries | Start Period |
| :--------- | :----------------------------------------------------------------------- | :------- | :------ | :------ | :----------- |
| `postgres` | `pg_isready -U ${POSTGRES_USER:-judge_user} -d ${POSTGRES_DB:-judge_db}` | `5s`     | `5s`    | `5`     | `10s`        |
| `redis`    | `redis-cli ping`                                                         | `5s`     | `3s`    | `5`     | `5s`         |
| `minio`    | `mc ready local`                                                         | `10s`    | `5s`    | `5`     | `10s`        |

_Why `mc ready local` for MinIO?_ Current official `minio/minio` images use minimal UBI base images that exclude `curl` and `wget`. The built-in MinIO client `mc` is bundled inside the image and provides a reliable native readiness probe.

---

## 8. Starting Infrastructure

```powershell
docker compose up -d
```

Check running containers and health status:

```powershell
docker compose ps
```

Watch live container logs:

```powershell
docker compose logs -f
```

---

## 9. Stopping Infrastructure

Stop containers cleanly **without deleting volumes**:

```powershell
docker compose down
```

_(Root npm/pnpm shortcut: `pnpm stop:services`)_

---

## 10. Restarting Services

Restart all services (or append a service name such as `postgres`, `redis`, or `minio`):

```powershell
docker compose restart
```

---

## 11. Connectivity Verification

Run the automated Day 3 verification script (establishes real TCP/RESP/HTTP/CLI checks and verifies volume mounts):

```powershell
pnpm infra:verify
```

Manual spot checks (Windows PowerShell):

```powershell
# PostgreSQL connectivity, password auth over TCP, and SELECT 1 check
docker exec judge_postgres pg_isready -U judge_user -d judge_db
docker exec -e PGPASSWORD=judge_secret_password judge_postgres psql -h 127.0.0.1 -U judge_user -d judge_db -c "SELECT 1;"

# Redis PING + SET/GET/DEL verification
docker exec judge_redis redis-cli ping
docker exec judge_redis redis-cli SET review_test "working"
docker exec judge_redis redis-cli GET review_test
docker exec judge_redis redis-cli DEL review_test

# MinIO API & Console local HTTP checks
Invoke-WebRequest -Uri "http://127.0.0.1:9000/minio/health/live" -UseBasicParsing
Invoke-WebRequest -Uri "http://127.0.0.1:9001/" -UseBasicParsing
```

Verify Compose YAML syntax without starting containers:

```powershell
docker compose config --quiet
```

---

## 12. Troubleshooting Common Problems

1. **`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`**
   - **Cause**: Docker Desktop (or the Linux container engine) is not running on Windows.
   - **Fix**: Start Docker Desktop, wait for the whale icon/engine status to report Running, then re-run `docker compose up -d` and `pnpm infra:verify`.

2. **Port `5432`, `6379`, `9000`, or `9001` already in use**
   - **Cause**: Another local Postgres, Redis, or MinIO instance is occupying the port.
   - **Fix**: Stop the conflicting local service or override `POSTGRES_PORT`, `REDIS_PORT`, `MINIO_API_PORT`, or `MINIO_CONSOLE_PORT` in `.env` (keep `.env` untracked).

3. **MinIO healthcheck failing if using an older Compose snippet**
   - **Cause**: Using `curl` inside modern `minio/minio` containers fails because `curl` is absent.
   - **Fix**: Ensure [`docker-compose.yml`](../docker-compose.yml) uses `['CMD', 'mc', 'ready', 'local']`.

4. **Volume data disappeared**
   - **Cause**: Running `docker compose down -v` or resetting volumes removed `postgres_data`, `redis_data`, or `minio_data`.
   - **Fix**: Always use `docker compose down` (without `-v`) or `docker compose restart`.
