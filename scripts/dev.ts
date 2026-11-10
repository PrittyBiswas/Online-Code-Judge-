#!/usr/bin/env tsx
/**
 * scripts/dev.ts
 *
 * Development orchestration helper.
 * Starts all services in the correct order for local development.
 * Usage: npx tsx scripts/dev.ts
 */

import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';

interface Service {
  name: string;
  cwd: string;
  cmd: string;
  args: string[];
  color: string;
}

const ROOT = resolve(__dirname, '..');

const RESET = '\x1b[0m';
const colors: Record<string, string> = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const services: Service[] = [
  {
    name: 'shared',
    cwd: resolve(ROOT, 'packages/shared'),
    cmd: 'npx',
    args: ['tsx', 'watch', 'src/index.ts'],
    color: colors.cyan,
  },
  {
    name: 'stub-mail',
    cwd: resolve(ROOT, 'apps/stub-mail'),
    cmd: 'npx',
    args: ['tsx', 'watch', 'src/index.ts'],
    color: colors.magenta,
  },
  {
    name: 'cron',
    cwd: resolve(ROOT, 'apps/cron'),
    cmd: 'npx',
    args: ['tsx', 'watch', 'src/index.ts'],
    color: colors.yellow,
  },
  {
    name: 'api',
    cwd: resolve(ROOT, 'apps/api'),
    cmd: 'npx',
    args: ['tsx', 'watch', 'src/server.ts'],
    color: colors.green,
  },
  {
    name: 'worker',
    cwd: resolve(ROOT, 'apps/judge-worker'),
    cmd: 'npx',
    args: ['tsx', 'watch', 'src/index.ts'],
    color: colors.blue,
  },
];

const processes: ChildProcess[] = [];

function startService(service: Service): void {
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  processes.push(child);

  const prefix = `${service.color}[${service.name}]${RESET} `;

  child.stdout?.on('data', (data) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) console.log(prefix + line);
    }
  });

  child.stderr?.on('data', (data) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) console.error(prefix + line);
    }
  });

  child.on('exit', (code) => {
    console.log(`${prefix}Process exited with code ${code}`);
  });
}

function shutdown(): void {
  console.log('\n[dev] Shutting down all services...');
  for (const child of processes) {
    child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[dev] Starting all services...\n');
for (const service of services) {
  startService(service);
}
