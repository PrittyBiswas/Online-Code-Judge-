import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Liveness probe (AC-OP-04)
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Extensive healthcheck (checks Postgres, Redis, MinIO, Docker reachability)
app.get('/health/extensive', async (req, res) => {
  const checks: Record<string, 'ok' | 'down'> = {
    api: 'ok',
    postgres: 'down',
    redis: 'down',
    minio: 'down',
  };

  // Status will be expanded as clients connect in upcoming steps
  const allHealthy = Object.values(checks).every((s) => s === 'ok');
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
  });
});

app.listen(PORT, () => {
  console.log(`[API] Online Code Judge API listening on port ${PORT}`);
});

