import { describe, it, expect, afterAll } from 'vitest';
import { runInSandbox } from '../src/sandbox/runner.js';
import { workerLifecycle } from '../src/recovery/shutdown.js';
import { Verdict } from '@judge/shared';

describe('Phase 2 — Real Docker Container Integration Tests', () => {
  afterAll(async () => {
    await workerLifecycle.cleanupActiveContainers();
  });

  describe('JavaScript (node:20-alpine in live Docker)', () => {
    it('executes successful stdin/stdout and custom input in real container', async () => {
      const res = await runInSandbox({
        language: 'javascript',
        code: `
          const fs = require('fs');
          const input = fs.readFileSync(0, 'utf8').trim();
          console.log("HELLO:" + input);
        `,
        input: 'custom_input_42\nsecond_line',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      });

      expect(res.verdict).toBe(Verdict.ACCEPTED);
      expect(res.stdout.trim()).toBe('HELLO:custom_input_42\nsecond_line');
      expect(res.executionTimeMs).toBeGreaterThan(0);
      expect(res.memoryUsedKb).toBeGreaterThan(0);
    });

    it('captures runtime error (RE) in real container', async () => {
      const res = await runInSandbox({
        language: 'javascript',
        code: `
          const x = null;
          x.doSomethingNonExistent();
        `,
        input: '',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      });

      expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
      expect(res.stderr).toContain('TypeError');
    });

    it('enforces timeout (TLE) in real container', async () => {
      const res = await runInSandbox({
        language: 'javascript',
        code: 'while (true) {}',
        input: '',
        timeLimitMs: 600,
        memoryLimitMb: 128,
      });

      expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      expect(res.executionTimeMs).toBeGreaterThanOrEqual(550);
    });
  });

  describe('Python (python:3.11-alpine in live Docker)', () => {
    it('executes successful stdin/stdout and custom input in real container', async () => {
      const res = await runInSandbox({
        language: 'python',
        code: `
import sys
data = sys.stdin.read().strip()
print(f"PY_OK:{data}")
`,
        input: 'multi\nline\ncustom\ninput',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      });

      expect(res.verdict).toBe(Verdict.ACCEPTED);
      expect(res.stdout.trim()).toBe('PY_OK:multi\nline\ncustom\ninput');
      expect(res.executionTimeMs).toBeGreaterThan(0);
      expect(res.memoryUsedKb).toBeGreaterThan(0);
    });

    it('captures syntax / compilation error in real container', async () => {
      const res = await runInSandbox({
        language: 'python',
        code: 'def syntax error here:',
        input: '',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      });

      expect(res.verdict).toBe(Verdict.COMPILATION_ERROR);
      expect(res.stderr).toContain('SyntaxError');
    });

    it('captures runtime error (ZeroDivisionError) in real container', async () => {
      const res = await runInSandbox({
        language: 'python',
        code: 'print(1 / 0)',
        input: '',
        timeLimitMs: 2000,
        memoryLimitMb: 128,
      });

      expect(res.verdict).toBe(Verdict.RUNTIME_ERROR);
      expect(res.stderr).toContain('ZeroDivisionError');
    });

    it('enforces timeout (TLE) in real container', async () => {
      const res = await runInSandbox({
        language: 'python',
        code: 'while True: pass',
        input: '',
        timeLimitMs: 600,
        memoryLimitMb: 128,
      });

      expect(res.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      expect(res.executionTimeMs).toBeGreaterThanOrEqual(550);
    });
  });
});
