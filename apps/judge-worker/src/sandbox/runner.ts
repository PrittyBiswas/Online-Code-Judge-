import { execFile, ChildProcess } from 'child_process';
import crypto from 'crypto';
import pino from 'pino';
import { Verdict, SupportedLanguage } from '@judge/shared';
import { workerEnv } from '../config/env.js';
import { workerLifecycle } from '../recovery/shutdown.js';
import type { WorkerFailureCategory } from '../utils/errors.js';

const logger = pino({
  level: workerEnv.LOG_LEVEL,
  base: { service: 'judge-worker-sandbox' },
});

export interface SandboxOptions {
  code: string;
  input: string;
  language?: SupportedLanguage;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  maxOutputBytes?: number;
  cpus?: string;
  pidsLimit?: number;
  image?: string;
}

export interface SandboxExecutionResult {
  verdict: Verdict;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  memoryUsedKb: number;
  exitCode: number | null;
  infraFailureCategory?: WorkerFailureCategory;
}

const COMPILE_ERROR_MARKER = '__JUDGE_COMPILE_ERROR__';
const MEMORY_MARKER_REGEX = /\n?__JUDGE_MEMORY_KB:(\d+)__\n?/g;

const JS_BOOTSTRAP = `
const fs = require('fs');
const { Readable } = require('stream');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const input = typeof payload.input === 'string' ? payload.input : '';
fs.writeFileSync('/tmp/.judge_stdin', input, 'utf8');
const origRead = fs.readFileSync;
fs.readFileSync = function (p, ...args) {
  if (p === 0 || p === '/dev/stdin') return origRead.call(fs, '/tmp/.judge_stdin', ...args);
  return origRead.call(fs, p, ...args);
};
Object.defineProperty(process, 'stdin', {
  value: Readable.from(input.length ? [Buffer.from(input, 'utf8')] : []),
  configurable: true,
});
function reportMem() {
  try {
    let kb = Math.round(process.memoryUsage().rss / 1024);
    for (const p of ['/sys/fs/cgroup/memory.peak', '/sys/fs/cgroup/memory/memory.max_usage_in_bytes']) {
      if (fs.existsSync(p)) {
        const val = parseInt(fs.readFileSync(p, 'utf8').trim(), 10);
        if (!Number.isNaN(val) && val > 0) { kb = Math.max(kb, Math.round(val / 1024)); break; }
      }
    }
    process.stderr.write('\\n__JUDGE_MEMORY_KB:' + kb + '__\\n');
  } catch {}
}
let memReported = false;
process.on('beforeExit', () => { if (!memReported) { memReported = true; reportMem(); } });
const origExit = process.exit.bind(process);
process.exit = (code) => { if (!memReported) { memReported = true; reportMem(); } origExit(code); };
let fn;
try {
  fn = new Function('require', payload.code);
} catch (err) {
  process.stderr.write('${COMPILE_ERROR_MARKER}\\n' + (err && err.stack ? err.stack : String(err)) + '\\n');
  origExit(65);
}
try {
  fn(require);
} catch (err) {
  process.stderr.write((err && err.stack ? err.stack : String(err)) + '\\n');
  process.exit(1);
}
`;

const PY_BOOTSTRAP = `
import io, json, resource, sys, traceback
payload = json.loads(sys.stdin.read())
sys.stdin = io.StringIO(payload.get('input', ''))
try:
  compiled = compile(payload['code'], '<submission>', 'exec')
except SyntaxError:
  sys.stderr.write('${COMPILE_ERROR_MARKER}\\n' + traceback.format_exc())
  sys.exit(65)
try:
  exec(compiled, {'__name__': '__main__'})
except SystemExit:
  raise
except BaseException:
  traceback.print_exc()
  sys.exit(1)
finally:
  try:
    kb = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    for p in ('/sys/fs/cgroup/memory.peak', '/sys/fs/cgroup/memory/memory.max_usage_in_bytes'):
      try:
        with open(p, 'r') as f:
          v = int(f.read().strip())
          if v > 0:
            kb = max(kb, v // 1024)
            break
      except OSError:
        pass
    sys.stderr.write(f'\\n__JUDGE_MEMORY_KB:{kb}__\\n')
  except Exception:
    pass
`;

export function buildDockerArgs(options: {
  containerName: string;
  language: SupportedLanguage;
  memoryLimitMb: number;
  cpus: string;
  pidsLimit: number;
  image?: string;
}): string[] {
  const { containerName, language, memoryLimitMb, cpus, pidsLimit, image } = options;
  const targetImage =
    image ||
    (language === 'python' ? workerEnv.SANDBOX_PYTHON_IMAGE : workerEnv.SANDBOX_DOCKER_IMAGE);

  const entrypointCmd =
    language === 'python' ? ['python3', '-I', '-c', PY_BOOTSTRAP] : ['node', '-e', JS_BOOTSTRAP];

  return [
    'run',
    '--name',
    containerName,
    '--rm',
    '--network',
    'none',
    `--memory=${memoryLimitMb}m`,
    `--memory-swap=${memoryLimitMb}m`,
    `--cpus=${cpus}`,
    `--pids-limit=${pidsLimit}`,
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
    targetImage,
    ...entrypointCmd,
  ];
}

function parseMemoryAndCleanStderr(rawStderr: string): { stderr: string; memoryUsedKb: number } {
  let memoryUsedKb = 0;
  const cleaned = rawStderr
    .replace(MEMORY_MARKER_REGEX, (_match, kbStr: string) => {
      const parsed = parseInt(kbStr, 10);
      if (!Number.isNaN(parsed)) {
        memoryUsedKb = Math.max(memoryUsedKb, parsed);
      }
      return '';
    })
    .replace(`${COMPILE_ERROR_MARKER}\n`, '')
    .trimEnd();

  return { stderr: cleaned, memoryUsedKb };
}

/**
 * Classifies exit conditions into Verdict and optional retryable infrastructure failure category.
 */
export function classifySandboxOutcome(params: {
  timedOut: boolean;
  outputExceeded: boolean;
  error: (Error & { code?: number | string; signal?: string | null }) | null;
  exitCode: number | null;
  rawStdout: string;
  rawStderr: string;
  durationMs: number;
  memoryLimitMb: number;
}): SandboxExecutionResult {
  const {
    timedOut,
    outputExceeded,
    error,
    exitCode,
    rawStdout,
    rawStderr,
    durationMs,
    memoryLimitMb,
  } = params;
  const { stderr: cleanStderr, memoryUsedKb } = parseMemoryAndCleanStderr(rawStderr);
  const boundedStderr = cleanStderr.slice(0, 65536);

  if (timedOut) {
    return {
      verdict: Verdict.TIME_LIMIT_EXCEEDED,
      stdout: '',
      stderr: 'Time Limit Exceeded',
      executionTimeMs: durationMs,
      memoryUsedKb,
      exitCode: null,
    };
  }

  if (outputExceeded) {
    return {
      verdict: Verdict.OUTPUT_LIMIT_EXCEEDED,
      stdout: rawStdout.slice(0, 1024),
      stderr: 'Output Limit Exceeded',
      executionTimeMs: durationMs,
      memoryUsedKb,
      exitCode: null,
    };
  }

  if (error) {
    const lowerErr = `${error.message || ''} ${boundedStderr}`.toLowerCase();

    if (
      lowerErr.includes('cannot connect to the docker daemon') ||
      lowerErr.includes('dockerdesktoplinuxengine') ||
      lowerErr.includes('error during connect') ||
      (error as any).code === 'ENOENT'
    ) {
      return {
        verdict: Verdict.INTERNAL_ERROR,
        stdout: '',
        stderr: 'Sandbox Docker daemon unavailable',
        executionTimeMs: durationMs,
        memoryUsedKb: 0,
        exitCode,
        infraFailureCategory: 'DOCKER_DAEMON_UNAVAILABLE',
      };
    }

    // Docker CLI reserves exit codes 125 (daemon/run flag error), 126 (cannot invoke), 127 (command missing).
    // Only classify as container startup failure if our language bootstrap never ran (no memory/compile marker).
    const bootstrapStarted =
      rawStderr.includes(COMPILE_ERROR_MARKER) || rawStderr.includes('__JUDGE_MEMORY_KB:');
    const isDockerImageError =
      lowerErr.includes('unable to find image') ||
      lowerErr.includes('pull access denied') ||
      lowerErr.includes('no such image');
    const isContainerStartError =
      isDockerImageError ||
      (!bootstrapStarted && (exitCode === 125 || exitCode === 126 || exitCode === 127));

    if (isContainerStartError) {
      return {
        verdict: Verdict.INTERNAL_ERROR,
        stdout: '',
        stderr: 'Sandbox container failed to start',
        executionTimeMs: durationMs,
        memoryUsedKb: 0,
        exitCode,
        infraFailureCategory: 'SANDBOX_CONTAINER_START_FAILED',
      };
    }

    const isOom =
      exitCode === 137 ||
      error.signal === 'SIGKILL' ||
      boundedStderr.includes('heap out of memory') ||
      boundedStderr.includes('MemoryError');

    if (isOom) {
      return {
        verdict: Verdict.MEMORY_LIMIT_EXCEEDED,
        stdout: rawStdout,
        stderr: 'Memory Limit Exceeded',
        executionTimeMs: durationMs,
        memoryUsedKb: Math.max(memoryUsedKb, memoryLimitMb * 1024),
        exitCode: 137,
      };
    }

    const isCompileError =
      exitCode === 65 ||
      rawStderr.includes(COMPILE_ERROR_MARKER) ||
      boundedStderr.includes('SyntaxError') ||
      boundedStderr.includes('IndentationError');

    return {
      verdict: isCompileError ? Verdict.COMPILATION_ERROR : Verdict.RUNTIME_ERROR,
      stdout: rawStdout,
      stderr: boundedStderr.slice(0, 2048),
      executionTimeMs: durationMs,
      memoryUsedKb,
      exitCode: exitCode ?? 1,
    };
  }

  return {
    verdict: Verdict.ACCEPTED,
    stdout: rawStdout,
    stderr: boundedStderr,
    executionTimeMs: durationMs,
    memoryUsedKb,
    exitCode: 0,
  };
}

function forceRemoveContainer(containerName: string): Promise<void> {
  return new Promise((done) => {
    execFile('docker', ['rm', '-f', containerName], { timeout: 5000 }, (rmErr, _out, rmStderr) => {
      if (rmErr) {
        const msg = String(rmStderr || rmErr.message || '');
        if (!msg.includes('No such container')) {
          logger.warn({ containerName, err: msg }, 'Container cleanup command failed');
        }
      }
      workerLifecycle.unregisterContainer(containerName);
      done();
    });
  });
}

/**
 * Executes untrusted code inside a disposable, locked-down Docker container.
 */
export async function runInSandbox(options: SandboxOptions): Promise<SandboxExecutionResult> {
  const {
    code,
    input,
    language = 'javascript',
    timeLimitMs = workerEnv.SANDBOX_TIMEOUT_MS,
    memoryLimitMb = workerEnv.SANDBOX_MEMORY_LIMIT_MB,
    maxOutputBytes = workerEnv.SANDBOX_OUTPUT_LIMIT_BYTES,
    cpus = workerEnv.SANDBOX_CPUS,
    pidsLimit = workerEnv.SANDBOX_PIDS_LIMIT,
    image,
  } = options;

  const startTime = Date.now();
  const containerName = `judge-sandbox-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const dockerArgs = buildDockerArgs({
    containerName,
    language,
    memoryLimitMb,
    cpus,
    pidsLimit,
    image,
  });

  workerLifecycle.registerContainer(containerName);

  return new Promise<SandboxExecutionResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let outputExceeded = false;
    let killed = false;
    let settled = false;

    const child: ChildProcess = execFile(
      'docker',
      dockerArgs,
      {
        timeout: timeLimitMs + 1500,
        maxBuffer: maxOutputBytes * 4,
      },
      (error, out, err) => {
        if (settled) return;
        settled = true;

        const durationMs = Date.now() - startTime;
        const rawStdout = (stdout || out || '').slice(0, maxOutputBytes);
        const rawStderr = stderr || err || '';
        const exitCode =
          child.exitCode ?? (typeof (error as any)?.code === 'number' ? (error as any).code : null);

        void forceRemoveContainer(containerName).then(() => {
          resolve(
            classifySandboxOutcome({
              timedOut,
              outputExceeded,
              error: error as (Error & { code?: number | string; signal?: string | null }) | null,
              exitCode,
              rawStdout,
              rawStderr,
              durationMs,
              memoryLimitMb,
            })
          );
        });
      }
    );

    const terminateContainer = () => {
      if (killed) return;
      killed = true;
      execFile('docker', ['kill', containerName], { timeout: 3000 }, (killErr, _o, killStderr) => {
        if (killErr) {
          const msg = String(killStderr || killErr.message || '');
          if (!msg.includes('No such container') && !msg.includes('is not running')) {
            logger.warn({ containerName, err: msg }, 'Failed killing sandbox container');
          }
        }
      });
      child.kill('SIGKILL');
    };

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      terminateContainer();
    }, timeLimitMs);

    const checkOutputCap = (chunk: Buffer | string) => {
      const totalBytes = Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8');
      if (totalBytes + Buffer.byteLength(chunk) > maxOutputBytes) {
        outputExceeded = true;
        terminateContainer();
        return true;
      }
      return false;
    };

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (checkOutputCap(chunk)) return;
        stdout += chunk.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (checkOutputCap(chunk)) return;
        stderr += chunk.toString();
      });
    }

    child.on('close', () => {
      clearTimeout(timeoutHandle);
    });

    if (child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ code, input }));
    }
  });
}
