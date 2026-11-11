import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseRedisConnectionOptions } from '../src/config/queue.js';
import { env } from '../src/config/env.js';

describe('Day 3 Infrastructure Configuration & Env Wiring', () => {
  const composePath = resolve(__dirname, '../../../docker-compose.yml');
  const composeText = readFileSync(composePath, 'utf8');

  it('keeps judge-worker and docker.sock out of docker-compose.yml', () => {
    expect(composeText).not.toContain('judge-worker');
    expect(composeText).not.toContain('docker.sock');
  });

  it('binds all published ports to 127.0.0.1 (never 0.0.0.0)', () => {
    const portMappings = composeText.match(/-\s+['"]?[^'\n]+:\d+['"]?/g) || [];
    expect(portMappings.length).toBeGreaterThanOrEqual(4);
    for (const mapping of portMappings) {
      expect(mapping).toContain('127.0.0.1:');
    }
  });

  it('configures named volumes, strict bucket init, and non-curl health checks', () => {
    expect(composeText).toContain('postgres_data:/var/lib/postgresql/data');
    expect(composeText).toContain('redis_data:/data');
    expect(composeText).toContain('minio_data:/data');
    expect(composeText).toContain('pg_isready');
    expect(composeText).toContain('redis-cli');
    expect(composeText).toContain('mc');
    expect(composeText).not.toContain('curl -f http://localhost:9000');
    expect(composeText).not.toContain('exit 0;');
  });

  it('parses REDIS_URL cleanly for BullMQ and exports MinIO/Redis env config', () => {
    const parsed = parseRedisConnectionOptions('redis://:secret@127.0.0.1:6380');
    expect(parsed.host).toBe('127.0.0.1');
    expect(parsed.port).toBe(6380);
    expect(parsed.password).toBe('secret');
    expect(env.REDIS_URL).toContain('redis://');
    expect(env.MINIO_PORT).toBeTypeOf('number');
  });
});
