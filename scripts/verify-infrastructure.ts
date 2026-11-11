#!/usr/bin/env tsx
/**
 * scripts/verify-infrastructure.ts
 *
 * Verifies live Day 3 local infrastructure connectivity (PostgreSQL, Redis, MinIO)
 * using real TCP/wire/HTTP connections and Docker Compose container inspection.
 * Never returns fake passes if Docker or any service is offline.
 *
 * Run with: pnpm infra:verify
 */

import { execFile } from 'child_process';
import { createConnection } from 'net';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const pgUser = process.env.POSTGRES_USER || 'judge_user';
const pgPassword = process.env.POSTGRES_PASSWORD || 'judge_secret_password';
const pgDb = process.env.POSTGRES_DB || 'judge_db';
const pgPort = Number(process.env.POSTGRES_PORT || 5432);

const redisAuthPrefix = process.env.REDIS_PASSWORD
  ? `:${encodeURIComponent(process.env.REDIS_PASSWORD)}@`
  : '';
const redisUrlRaw =
  process.env.REDIS_URL ||
  `redis://${redisAuthPrefix}${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || '6379'}`;
const redisUrl = new URL(redisUrlRaw);
const redisHost = redisUrl.hostname === 'localhost' ? '127.0.0.1' : redisUrl.hostname;
const redisPort = Number(redisUrl.port || 6379);

const minioApiPort = Number(process.env.MINIO_API_PORT || process.env.MINIO_PORT || 9000);
const minioConsolePort = Number(process.env.MINIO_CONSOLE_PORT || 9001);

function execDocker(args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile('docker', args, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message));
        return;
      }
      resolvePromise(stdout.trim());
    });
  });
}

function checkTcpPort(host: string, port: number, label: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(3000);
    socket.once('connect', () => {
      socket.end();
      resolvePromise();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`${label} TCP connection timed out at ${host}:${port}`));
    });
    socket.once('error', (err) => {
      socket.destroy();
      reject(new Error(`${label} TCP connection failed at ${host}:${port}: ${err.message}`));
    });
  });
}

function checkRedisRoundTrip(host: string, port: number, password?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(3000);
    let buffer = '';
    const testKey = `review_test_${Date.now()}`;
    const commands: string[] = [];
    if (password) {
      commands.push(`*2\r\n$4\r\nAUTH\r\n$${Buffer.byteLength(password)}\r\n${password}\r\n`);
    }
    commands.push(
      '*1\r\n$4\r\nPING\r\n',
      `*3\r\n$3\r\nSET\r\n$${Buffer.byteLength(testKey)}\r\n${testKey}\r\n$7\r\nworking\r\n`,
      `*2\r\n$3\r\nGET\r\n$${Buffer.byteLength(testKey)}\r\n${testKey}\r\n`,
      `*2\r\n$3\r\nDEL\r\n$${Buffer.byteLength(testKey)}\r\n${testKey}\r\n`
    );
    let step = 0;

    socket.once('connect', () => {
      socket.write(commands[step]);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.endsWith('\r\n')) return;

      const reply = buffer.trim();
      buffer = '';
      const currentCmd = commands[step];
      step++;

      if (currentCmd.includes('PING') && reply !== '+PONG') {
        socket.destroy();
        reject(new Error(`Unexpected Redis PING response: ${reply}`));
        return;
      }
      if (currentCmd.includes('GET') && !reply.includes('working')) {
        socket.destroy();
        reject(new Error(`Unexpected Redis GET response: ${reply}`));
        return;
      }

      if (step < commands.length) {
        socket.write(commands[step]);
      } else {
        socket.end();
        resolvePromise('+PONG (SET/GET/DEL verified)');
      }
    });

    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`Redis command timed out at ${host}:${port}`));
    });

    socket.once('error', (err) => {
      socket.destroy();
      reject(new Error(`Redis socket error at ${host}:${port}: ${err.message}`));
    });
  });
}

async function verifyServiceVolume(containerName: string, expectedDest: string): Promise<string> {
  const raw = await execDocker(['inspect', '--format', '{{json .Mounts}}', containerName]);
  const mounts = JSON.parse(raw) as Array<{ Type: string; Name?: string; Destination: string }>;
  const vol = mounts.find((m) => m.Type === 'volume' && m.Destination === expectedDest);
  if (!vol) {
    throw new Error(
      `Container ${containerName} does not have named volume mounted at ${expectedDest}`
    );
  }
  return vol.Name || 'named-volume';
}

async function main() {
  console.log('🔍 Checking Day 3 local infrastructure...\n');

  try {
    await execDocker(['info']);
  } catch (err: any) {
    console.error('❌ Docker daemon is not reachable:');
    console.error(`   ${err.message}`);
    console.error('\nStart Docker Desktop and run:');
    console.error('   docker compose up -d');
    console.error('   pnpm infra:verify');
    process.exit(1);
  }

  let failures = 0;

  // 1. PostgreSQL
  try {
    const status = await execDocker([
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      'judge_postgres',
    ]);
    if (status !== 'healthy') {
      throw new Error(`judge_postgres health is "${status}" (expected "healthy")`);
    }
    const vol = await verifyServiceVolume('judge_postgres', '/var/lib/postgresql/data');
    await checkTcpPort('127.0.0.1', pgPort, 'PostgreSQL');
    await execDocker(['exec', 'judge_postgres', 'pg_isready', '-U', pgUser, '-d', pgDb]);
    const dbCheck = await execDocker([
      'exec',
      '-e',
      `PGPASSWORD=${pgPassword}`,
      'judge_postgres',
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      pgUser,
      '-d',
      pgDb,
      '-tAc',
      "SELECT 1 || ':' || current_database() || ':' || current_user;",
    ]);
    if (dbCheck !== `1:${pgDb}:${pgUser}`) {
      throw new Error(`Unexpected Postgres TCP verification result "${dbCheck}"`);
    }
    console.log(
      `✅ PostgreSQL : healthy | 127.0.0.1:${pgPort} | db=${pgDb} user=${pgUser} | volume=${vol}`
    );
  } catch (err: any) {
    failures++;
    console.error(`❌ PostgreSQL : ${err.message}`);
  }

  // 2. Redis
  try {
    const status = await execDocker([
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      'judge_redis',
    ]);
    if (status !== 'healthy') {
      throw new Error(`judge_redis health is "${status}" (expected "healthy")`);
    }
    const vol = await verifyServiceVolume('judge_redis', '/data');
    const reply = await checkRedisRoundTrip(
      redisHost,
      redisPort,
      redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined
    );
    console.log(`✅ Redis      : healthy | ${redisHost}:${redisPort} | ${reply} | volume=${vol}`);
  } catch (err: any) {
    failures++;
    console.error(`❌ Redis      : ${err.message}`);
  }

  // 3. MinIO
  try {
    const status = await execDocker([
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      'judge_minio',
    ]);
    if (status !== 'healthy') {
      throw new Error(`judge_minio health is "${status}" (expected "healthy")`);
    }
    const vol = await verifyServiceVolume('judge_minio', '/data');
    const liveRes = await fetch(`http://127.0.0.1:${minioApiPort}/minio/health/live`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!liveRes.ok) {
      throw new Error(`MinIO live endpoint returned HTTP ${liveRes.status}`);
    }
    const consoleRes = await fetch(`http://127.0.0.1:${minioConsolePort}/`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!consoleRes.ok) {
      throw new Error(`MinIO Console returned HTTP ${consoleRes.status}`);
    }
    console.log(
      `✅ MinIO      : healthy | API 127.0.0.1:${minioApiPort} (${liveRes.status}) | Console 127.0.0.1:${minioConsolePort} (${consoleRes.status}) | volume=${vol}`
    );
  } catch (err: any) {
    failures++;
    console.error(`❌ MinIO      : ${err.message}`);
  }

  if (failures > 0) {
    console.error(`\n❌ Infrastructure verification failed (${failures} check(s) failed).`);
    process.exit(1);
  }

  console.log('\n🎉 All Day 3 infrastructure checks passed.');
}

main();
