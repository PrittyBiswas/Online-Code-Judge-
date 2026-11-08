# Online Code Judge 🚀

A robust, production-grade Online Code Judge platform designed to run untrusted code safely inside disposable sandbox containers, stream live verdicts via Server-Sent Events (SSE), manage problem sets with MinIO, and maintain real-time leaderboards using Redis Sorted Sets.

---

## 🏗️ Architecture & Service Map

The system consists of Docker Compose services and a host-level judge worker:

```
[ Browser / React App ]
         │
         ▼ (HTTP POST /submissions)
[ Express API ] ─────────► [ PostgreSQL ] (Stores users, problems, submissions)
         │
         ├───────────────► [ BullMQ / Redis ] (Job queue & rate limiting)
         │
         ◄─────────────── [ Redis Pub/Sub ] (SSE Live Updates to browser)
                                 ▲
                                 │
[ Judge Worker (Host Process) ] ─┘ (Pulls jobs, saves verdicts)
         │
         ├───────────────► [ MinIO ] (Fetches test cases: input.txt / output.txt)
         │
         └───────────────► [ Docker Sandbox Engine ] (Runs locked-down container)
```

| Service | Host/Port | Role |
| :--- | :--- | :--- |
| **`api`** | `http://localhost:4000` | Express REST API & SSE live updates endpoint |
| **`frontend`** | `http://localhost:5173` | React + Vite UI with Monaco Editor |
| **`postgres`** | `localhost:5432` | Relational database (users, problems, submissions) |
| **`redis`** | `localhost:6379` | BullMQ queues, rate limits, caching, sorted set leaderboards |
| **`minio`** | `localhost:9000` (Console: `9001`) | S3-compatible test case storage |
| **`judge-worker`** | Host process | Node.js host worker that spawns disposable Docker sandboxes |

---

## 🔒 Non-Negotiable Safety Rules

1. **Host-Run Worker**: The worker runs outside Docker Compose directly on the host to avoid mounting the Docker socket into any container.
2. **Container Lockdown Flags**:
   * `--network none`: Zero external or internal network access.
   * `--memory=128m --memory-swap=128m`: Strict RAM limit with swap disabled.
   * `--cpus=0.5`: CPU throttling to prevent host starvation.
   * `--pids-limit=64`: Halts process fork-bombs.
   * `--read-only`: Completely read-only filesystem with a small 16MB tmpfs for scratch.
   * `--cap-drop ALL` & `--security-opt no-new-privileges`: All Linux kernel privileges dropped.
   * Non-root user execution (`--user 1000:1000`).
3. **Hard External Timeout**: Host worker enforces a wall-clock kill signal if the container exceeds execution time.
4. **Output Cap**: Output stream capped at 64 KB to stop memory exhaustion.

---

## ⚡ Getting Started

### 1. Prerequisites
* **Node.js** v20+ LTS
* **pnpm** (or `npm`)
* **Docker Desktop** (running on your host machine)

### 2. Start Supporting Services
```bash
# Start PostgreSQL, Redis, MinIO
docker compose up -d
```

### 3. Run Week 1 Sandbox Demo
```bash
# Run the standalone sandbox runner (proves timeout kill and math execution)
cd apps/judge-worker
npm run test:sandbox
```

---

## 📚 Documentation
Detailed documentation is maintained in the `/docs` directory:
* [`docs/safety.md`](docs/safety.md): Safety rules, Docker flag breakdown, and attack suite rationale.
* [`docs/learning-notes.md`](docs/learning-notes.md): Week 1 Concept check and answers.
* [`docs/architecture.md`](docs/architecture.md): Service architecture and decision log.

