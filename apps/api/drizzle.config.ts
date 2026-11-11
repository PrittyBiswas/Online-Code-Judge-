import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'drizzle-kit';

const rootEnvPath = resolve(__dirname, '../../.env');
if (existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const pgUser = encodeURIComponent(process.env.POSTGRES_USER || 'judge_user');
const pgPass = encodeURIComponent(process.env.POSTGRES_PASSWORD || 'judge_secret_password');
const pgHost = process.env.POSTGRES_HOST || 'localhost';
const pgPort = process.env.POSTGRES_PORT || '5432';
const pgDb = process.env.POSTGRES_DB || 'judge_db';

const databaseUrl =
  process.env.DATABASE_URL || `postgresql://${pgUser}:${pgPass}@${pgHost}:${pgPort}/${pgDb}`;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: '../../drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});

