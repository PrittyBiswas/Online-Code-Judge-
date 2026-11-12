import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import { join, resolve } from 'path';
import { Verdict } from '@judge/shared';
import { buildDockerArgs, runInSandbox } from '../src/sandbox/runner.js';
import { workerLifecycle } from '../src/recovery/shutdown.js';
import { workerEnv } from '../src/config/env.js';

const REPO_ROOT = resolve(__dirname, '../../..');
const ATTACK_ROOT = resolve(REPO_ROOT, 'attack-suite');

function execDocker(args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile('docker', args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolvePromise(stdout.trim());
    });
  });
}

async function assertNoLeftoverSandboxContainers(): Promise<void> {
  const leftover = await execDocker(['ps', '-a', '-q', '--filter', 'name=judge-sandbox-']);
  expect(leftover).toBe('');
  expect(workerLifecycle.getActiveContainerCount()).toBe(0);
}

describe('Day 9 — Sandbox Security Attack Suite (SAFE-01 to SAFE-09)', () => {
  beforeAll(async () => {
    await execDocker(['info']);
    await execDocker(['image', 'inspect', workerEnv.SANDBOX_DOCKER_IMAGE]);
    await execDocker(['image', 'inspect', workerEnv.SANDBOX_PYTHON_IMAGE]);
  });

  afterAll(async () => {
    await workerLifecycle.cleanupActiveContainers();
    await assertNoLeftoverSandboxContainers();
  });

  it('SAFE-01: terminates JavaScript & Python infinite loops via external timeout (TLE)', async () => {
    const jsCode = readFileSync(resolve(ATTACK_ROOT, 'infinite-loop/index.js'), 'utf8');
    const jsRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: jsCode,
      timeLimitMs: 700,
    });
    expect(jsRes.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
    expect(jsRes.executionTimeMs).toBeGreaterThanOrEqual(650);
    expect(jsRes.executionTimeMs).toBeLessThan(3500);

    const pyRes = await runInSandbox({
      language: 'python',
      input: '',
      code: 'while True:\n    pass',
      timeLimitMs: 700,
    });
    expect(pyRes.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);

    // Worker remains responsive after infinite loops
    const followUp = await runInSandbox({
      language: 'javascript',
      input: '',
      code: 'console.log("alive");',
      timeLimitMs: 2000,
    });
    expect(followUp.verdict).toBe(Verdict.ACCEPTED);
    expect(followUp.stdout.trim()).toBe('alive');
    await assertNoLeftoverSandboxContainers();
  }, 30000);

  it('SAFE-02: enforces memory & swap limits on bounded JS & Python memory bombs (MLE)', async () => {
    const jsBomb = readFileSync(resolve(ATTACK_ROOT, 'memory-bomb/index.js'), 'utf8');
    const jsRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: jsBomb,
      timeLimitMs: 4000,
      memoryLimitMb: 64,
    });
    expect(jsRes.verdict).toBe(Verdict.MEMORY_LIMIT_EXCEEDED);
    expect(jsRes.memoryUsedKb).toBeGreaterThanOrEqual(64 * 1024);

    const pyRes = await runInSandbox({
      language: 'python',
      input: '',
      code: 'buf = bytearray(256 * 1024 * 1024)\nprint(len(buf))',
      timeLimitMs: 4000,
      memoryLimitMb: 64,
    });
    expect(pyRes.verdict).toBe(Verdict.MEMORY_LIMIT_EXCEEDED);
    await assertNoLeftoverSandboxContainers();
  }, 30000);

  it('SAFE-03: restricts process/fork bombs via --pids-limit in JS & Python', async () => {
    const jsFork = readFileSync(resolve(ATTACK_ROOT, 'fork-bomb/index.js'), 'utf8');
    const jsRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: jsFork,
      timeLimitMs: 1200,
      pidsLimit: 32,
    });
    expect([Verdict.RUNTIME_ERROR, Verdict.TIME_LIMIT_EXCEEDED]).toContain(jsRes.verdict);

    const pyFork = `
import os
for _ in range(100):
    try:
        pid = os.fork()
        if pid == 0:
            os._exit(0)
    except OSError as e:
        print("FORK_BLOCKED")
        raise
`;
    const pyRes = await runInSandbox({
      language: 'python',
      input: '',
      code: pyFork,
      timeLimitMs: 2000,
      pidsLimit: 24,
    });
    expect([Verdict.RUNTIME_ERROR, Verdict.TIME_LIMIT_EXCEEDED]).toContain(pyRes.verdict);
    await assertNoLeftoverSandboxContainers();
  }, 30000);

  it('SAFE-04: blocks DNS/HTTP, external IPs, and localhost service dials via --network none', async () => {
    const netAttack = readFileSync(resolve(ATTACK_ROOT, 'network-attempt/index.js'), 'utf8');
    const dnsHttpRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: netAttack,
      timeLimitMs: 2500,
    });
    expect([Verdict.RUNTIME_ERROR, Verdict.TIME_LIMIT_EXCEEDED]).toContain(dnsHttpRes.verdict);
    expect(dnsHttpRes.stdout).not.toContain('NETWORK BREACH');

    // Direct IP and local host service connection attempts fail immediately
    const socketProbe = `
const net = require('net');
Promise.allSettled([
  new Promise((_, rej) => { const s = net.connect(80, '1.1.1.1'); s.on('error', rej); s.on('connect', () => rej('CONNECTED_EXT')); }),
  new Promise((_, rej) => { const s = net.connect(5433, '127.0.0.1'); s.on('error', rej); s.on('connect', () => rej('CONNECTED_PG')); }),
  new Promise((_, rej) => { const s = net.connect(6379, '127.0.0.1'); s.on('error', rej); s.on('connect', () => rej('CONNECTED_REDIS')); }),
]).then((results) => {
  const breached = results.some(r => String(r.reason).startsWith('CONNECTED'));
  console.log(breached ? 'NETWORK BREACH' : 'ALL_SOCKETS_BLOCKED');
  process.exit(breached ? 0 : 1);
});
`;
    const directRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: socketProbe,
      timeLimitMs: 2000,
    });
    expect(directRes.verdict).toBe(Verdict.RUNTIME_ERROR);
    expect(directRes.stdout).toContain('ALL_SOCKETS_BLOCKED');
    expect(directRes.stdout).not.toContain('NETWORK BREACH');
    await assertNoLeftoverSandboxContainers();
  }, 30000);

  it('SAFE-05: isolates host marker files, enforces read-only root FS, and caps/noexec /tmp', async () => {
    const tmpHostDir = mkdtempSync(join(os.tmpdir(), 'judge-safe05-'));
    const hostMarkerPath = join(tmpHostDir, 'marker.txt');
    writeFileSync(hostMarkerPath, 'HARMLESS_DAY9_MARKER', 'utf8');

    try {
      const fileAccessCode = readFileSync(resolve(ATTACK_ROOT, 'file-access/index.js'), 'utf8');
      const fsRes = await runInSandbox({
        language: 'javascript',
        input: '',
        code: fileAccessCode,
        timeLimitMs: 3000,
      });
      expect(fsRes.verdict).toBe(Verdict.RUNTIME_ERROR);
      expect(fsRes.stdout).not.toContain('ROOT FS WRITE BREACH');

      const tmpEscapeCode = readFileSync(resolve(ATTACK_ROOT, 'tmp-escape/index.js'), 'utf8');
      const escapeRes = await runInSandbox({
        language: 'javascript',
        input: JSON.stringify({ hostMarkerPath }),
        code: tmpEscapeCode,
        timeLimitMs: 4000,
      });
      expect(escapeRes.verdict).toBe(Verdict.RUNTIME_ERROR);
      const report = JSON.parse(escapeRes.stdout.trim());
      expect(report).toEqual({
        hostMarkerReadable: false,
        rootWriteSucceeded: false,
        tmpExecSucceeded: false,
        tmpOverLimitSucceeded: false,
      });
    } finally {
      rmSync(tmpHostDir, { recursive: true, force: true });
    }
    await assertNoLeftoverSandboxContainers();
  }, 30000);

  it('SAFE-06: caps both stdout and stderr floods cleanly (OUTPUT_LIMIT_EXCEEDED)', async () => {
    const stdoutFlood = readFileSync(resolve(ATTACK_ROOT, 'output-flood/index.js'), 'utf8');
    const outRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: stdoutFlood,
      timeLimitMs: 3000,
    });
    expect(outRes.verdict).toBe(Verdict.OUTPUT_LIMIT_EXCEEDED);
    expect(outRes.stdout.length).toBeLessThanOrEqual(1024);

    const stderrFlood = readFileSync(resolve(ATTACK_ROOT, 'stderr-flood/index.js'), 'utf8');
    const errRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: stderrFlood,
      timeLimitMs: 3000,
    });
    expect(errRes.verdict).toBe(Verdict.OUTPUT_LIMIT_EXCEEDED);
    expect(errRes.stderr).toBe('Output Limit Exceeded');
    await assertNoLeftoverSandboxContainers();
  }, 30000);

  it('SAFE-07: drops Linux capabilities, enforces non-root UID/GID 1000, no-new-privileges, and port>=1024', async () => {
    const privCode = readFileSync(resolve(ATTACK_ROOT, 'privilege-check/index.js'), 'utf8');
    const privRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: privCode,
      timeLimitMs: 3000,
    });
    expect(privRes.verdict).toBe(Verdict.RUNTIME_ERROR);
    expect(privRes.stdout).toContain('Running as UID: 1000');
    expect(privRes.stdout).toContain('Running as GID: 1000');
    expect(privRes.stdout).toContain('su blocked (expected)');
    expect(privRes.stdout).toContain('chmod +s blocked (expected)');
    expect(privRes.stdout).toContain('Port 80 bind blocked (expected): EACCES');
    expect(privRes.stdout).not.toContain('BREACH');

    const probeCode = readFileSync(resolve(ATTACK_ROOT, 'env-secret-probe/index.js'), 'utf8');
    const probeRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: probeCode,
      timeLimitMs: 3000,
    });
    expect(probeRes.verdict).toBe(Verdict.ACCEPTED);
    const meta = JSON.parse(probeRes.stdout.trim());
    expect(meta.uid).toBe(1000);
    expect(meta.gid).toBe(1000);
    expect(meta.capEff).toBe('0000000000000000');
    expect(meta.noNewPrivs).toBe('1');
    await assertNoLeftoverSandboxContainers();
  }, 30000);

  it('SAFE-08: guarantees complete container cleanup and zero cross-run state leakage across verdicts', async () => {
    // Run 1 creates a temp file in /tmp
    const writer = await runInSandbox({
      language: 'javascript',
      input: '',
      code: `require('fs').writeFileSync('/tmp/cross_run_leak.txt', 'secret_state'); console.log('WROTE');`,
      timeLimitMs: 2000,
    });
    expect(writer.verdict).toBe(Verdict.ACCEPTED);
    await assertNoLeftoverSandboxContainers();

    // Run 2 must NOT see /tmp/cross_run_leak.txt
    const reader = await runInSandbox({
      language: 'javascript',
      input: '',
      code: `console.log(require('fs').existsSync('/tmp/cross_run_leak.txt') ? 'LEAKED' : 'CLEAN');`,
      timeLimitMs: 2000,
    });
    expect(reader.verdict).toBe(Verdict.ACCEPTED);
    expect(reader.stdout.trim()).toBe('CLEAN');
    await assertNoLeftoverSandboxContainers();

    // TLE, OLE, and unexpected non-zero exit leave zero containers behind
    await runInSandbox({
      language: 'javascript',
      input: '',
      code: 'while (true) {}',
      timeLimitMs: 500,
    });
    await assertNoLeftoverSandboxContainers();

    await runInSandbox({
      language: 'javascript',
      input: '',
      code: `while (true) process.stdout.write('Z'.repeat(2048));`,
      timeLimitMs: 2000,
    });
    await assertNoLeftoverSandboxContainers();

    await runInSandbox({
      language: 'python',
      input: '',
      code: 'import sys; sys.exit(42)',
      timeLimitMs: 2000,
    });
    await assertNoLeftoverSandboxContainers();

    // Final normal JS & Python submissions succeed
    const finalPy = await runInSandbox({
      language: 'python',
      input: '9 4',
      code: 'a, b = map(int, input().split()); print(a + b)',
      timeLimitMs: 2000,
    });
    expect(finalPy.verdict).toBe(Verdict.ACCEPTED);
    expect(finalPy.stdout.trim()).toBe('13');
    await assertNoLeftoverSandboxContainers();
  }, 45000);

  it('SAFE-09: verifies live Docker container boundaries, Compose isolation, and zero host secret exposure', async () => {
    const containerName = `judge-sandbox-inspect-${Date.now()}`;
    const args = buildDockerArgs({
      containerName,
      language: 'javascript',
      memoryLimitMb: 128,
      cpus: '0.5',
      pidsLimit: 64,
    });
    // Replace the trailing `node -e ...` command with `sleep 10` while keeping every security flag intact
    const runPrefix = args.slice(0, -3);
    const inspectArgs = [...runPrefix, workerEnv.SANDBOX_DOCKER_IMAGE, 'sleep', '10'];
    const detachedArgs = ['run', '-d', ...inspectArgs.slice(1)];

    let cid = '';
    try {
      cid = await execDocker(detachedArgs);
      const rawInspect = await execDocker(['inspect', cid]);
      const [info] = JSON.parse(rawInspect);

      expect(info.HostConfig.Privileged).toBe(false);
      expect(info.HostConfig.ReadonlyRootfs).toBe(true);
      expect(info.HostConfig.NetworkMode).toBe('none');
      expect(info.HostConfig.CapDrop).toContain('ALL');
      expect(info.HostConfig.SecurityOpt).toContain('no-new-privileges');
      expect(info.HostConfig.Memory).toBe(128 * 1024 * 1024);
      expect(info.HostConfig.MemorySwap).toBe(128 * 1024 * 1024);
      expect(info.HostConfig.NanoCpus).toBe(500_000_000);
      expect(info.HostConfig.PidsLimit).toBe(64);
      expect(info.HostConfig.Tmpfs['/tmp']).toBe('rw,noexec,nosuid,size=16m');
      expect(info.HostConfig.Sysctls['net.ipv4.ip_unprivileged_port_start']).toBe('1024');
      expect(info.Config.User).toBe('1000:1000');
      expect(info.Mounts).toEqual([]);
    } finally {
      if (cid) {
        await execDocker(['rm', '-f', cid]).catch(() => {});
      }
      await assertNoLeftoverSandboxContainers();
    }

    // Verify docker-compose.yml contains no docker.sock mounts or privileged mode
    const composeYaml = readFileSync(resolve(REPO_ROOT, 'docker-compose.yml'), 'utf8');
    expect(composeYaml).not.toContain('docker.sock');
    expect(composeYaml).not.toMatch(/privileged:\s*true/i);

    // Verify no host secrets leak into sandbox process.env
    const probeCode = readFileSync(resolve(ATTACK_ROOT, 'env-secret-probe/index.js'), 'utf8');
    const envRes = await runInSandbox({
      language: 'javascript',
      input: '',
      code: probeCode,
      timeLimitMs: 3000,
    });
    expect(envRes.verdict).toBe(Verdict.ACCEPTED);
    const { envKeys } = JSON.parse(envRes.stdout.trim()) as { envKeys: string[] };
    for (const forbidden of [
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
      'MINIO_SECRET_KEY',
      'MINIO_ROOT_PASSWORD',
      'POSTGRES_PASSWORD',
    ]) {
      expect(envKeys).not.toContain(forbidden);
    }
    await assertNoLeftoverSandboxContainers();
  }, 30000);
});
