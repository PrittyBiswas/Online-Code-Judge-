import { execFile, ChildProcess } from 'child_process';
import { Verdict } from '@judge/shared';

export interface SandboxOptions {
  code: string;
  input: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  maxOutputBytes?: number;
  image?: string;
}

export interface SandboxExecutionResult {
  verdict: Verdict;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  exitCode: number | null;
}

/**
 * Executes untrusted JavaScript code inside a locked-down Docker container.
 * Adheres strictly to the task safety rules:
 * - Uses child_process.execFile (no shell concatenation).
 * - Fresh disposable container (--rm).
 * - --network none (zero network).
 * - Memory & CPU & PIDs limits.
 * - --read-only root filesystem with size-capped tmpfs.
 * - --cap-drop ALL and --security-opt no-new-privileges.
 * - Non-root execution.
 * - Hard external wall-clock timeout.
 * - Output cap (e.g., 64 KB).
 */
export async function runInSandbox(options: SandboxOptions): Promise<SandboxExecutionResult> {
  const {
    code,
    input,
    timeLimitMs = 2000,
    memoryLimitMb = 128,
    maxOutputBytes = 65536, // 64 KB cap
    image = 'node:20-alpine',
  } = options;

  const startTime = Date.now();
  const containerName = `judge-sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Wrap user code to feed standard input via stdin stream
  const runnerScript = `
    const fs = require('fs');
    try {
      const code = ${JSON.stringify(code)};
      const input = ${JSON.stringify(input)};
      
      // Setup mock stdin or execute
      process.stdin.push(input);
      process.stdin.push(null);
      
      const fn = new Function('require', code);
      fn(require);
    } catch (err) {
      console.error(err && err.stack ? err.stack : String(err));
      process.exit(1);
    }
  `;

  const dockerArgs = [
    'run',
    '--name',
    containerName,
    '--rm',
    '--network',
    'none',
    `--memory=${memoryLimitMb}m`,
    `--memory-swap=${memoryLimitMb}m`,
    '--cpus=0.5',
    '--pids-limit=64',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    '1000:1000',
    '-i',
    image,
    'node',
    '-e',
    runnerScript,
  ];

  return new Promise<SandboxExecutionResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let outputExceeded = false;
    let killed = false;

    const child: ChildProcess = execFile(
      'docker',
      dockerArgs,
      {
        timeout: timeLimitMs + 1000, // Safety margin for external watcher
        maxBuffer: maxOutputBytes * 2,
      },
      (error, out, err) => {
        const duration = Date.now() - startTime;
        stdout = (stdout || out || '').slice(0, maxOutputBytes);
        stderr = (stderr || err || '').slice(0, maxOutputBytes);

        // Clean up container just in case --rm didn't catch it
        execFile('docker', ['rm', '-f', containerName], () => {});

        if (timedOut) {
          return resolve({
            verdict: Verdict.TIME_LIMIT_EXCEEDED,
            stdout: '',
            stderr: 'Time Limit Exceeded',
            executionTimeMs: duration,
            exitCode: null,
          });
        }

        if (outputExceeded) {
          return resolve({
            verdict: Verdict.OUTPUT_LIMIT_EXCEEDED,
            stdout: stdout.slice(0, 1024),
            stderr: 'Output Limit Exceeded',
            executionTimeMs: duration,
            exitCode: null,
          });
        }

        if (error) {
          // Exit code 137 indicates OOM killed (SIGKILL)
          if (child.exitCode === 137 || error.signal === 'SIGKILL') {
            return resolve({
              verdict: Verdict.MEMORY_LIMIT_EXCEEDED,
              stdout,
              stderr: 'Memory Limit Exceeded',
              executionTimeMs: duration,
              exitCode: 137,
            });
          }

          // Compilation / Syntax Error vs Runtime Error
          const isSyntaxError = stderr.includes('SyntaxError');
          return resolve({
            verdict: isSyntaxError ? Verdict.COMPILATION_ERROR : Verdict.RUNTIME_ERROR,
            stdout,
            stderr: stderr.slice(0, 2048),
            executionTimeMs: duration,
            exitCode: child.exitCode ?? 1,
          });
        }

        return resolve({
          verdict: Verdict.ACCEPTED,
          stdout,
          stderr,
          executionTimeMs: duration,
          exitCode: 0,
        });
      }
    );

    // Hard wall-clock timer enforced by host worker
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      if (!killed) {
        killed = true;
        // Kill the container directly via docker stop/rm
        execFile('docker', ['kill', containerName], () => {});
        child.kill('SIGKILL');
      }
    }, timeLimitMs);

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > maxOutputBytes) {
          outputExceeded = true;
          if (!killed) {
            killed = true;
            execFile('docker', ['kill', containerName], () => {});
            child.kill('SIGKILL');
          }
        }
      });
    }

    child.on('close', () => {
      clearTimeout(timeoutHandle);
    });
  });
}
