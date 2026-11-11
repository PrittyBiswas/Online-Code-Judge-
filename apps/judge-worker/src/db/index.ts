import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import pino from 'pino';
import { workerEnv } from '../config/env.js';
import * as schema from './schema.js';

const logger = pino({ level: workerEnv.LOG_LEVEL, base: { service: 'judge-worker-db' } });

export const pool = new Pool({
  connectionString: workerEnv.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.warn({ err: err.message }, 'PostgreSQL pool error in judge-worker');
});

export const db = drizzle(pool, { schema });

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export { schema };

