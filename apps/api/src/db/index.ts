import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.warn({ err: err.message }, 'PostgreSQL pool error');
});

export const db = drizzle(pool, { schema });

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'PostgreSQL health check failed');
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export { schema };

