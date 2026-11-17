import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import {
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  LANGUAGE_CONFIGS,
  STARTER_CODE,
  Verdict,
  createSubmissionSchema,
  runSampleSchema,
} from '@judge/shared';
import { buildDockerArgs, classifySandboxOutcome } from '../src/sandbox/runner.js';
import {
  COMPILER_SPECS,
  detectJavaClassName,
  formatCompiledStdinPayload,
  buildCompiledRunnerScript,
  getDefaultImageForLanguage,
  isCompiledLanguage,
  COMPILE_ERROR_MARKER,
} from '../src/sandbox/compilers.js';
import { Executor } from '../src/executor/executor.js';

describe('Multi-Language Compiler & Secure Sandbox Tests (Phase 1)', () => {
  describe('Language Configurations & Shared Contracts', () => {
    it('supports all seven required languages in SUPPORTED_LANGUAGES', () => {
      const expected = ['javascript', 'python', 'c', 'cpp', 'java', 'go', 'rust'];
      expect(SUPPORTED_LANGUAGES).toEqual(expected);
      expect(SUPPORTED_LANGUAGES).toHaveLength(7);
    });

    it('defines complete LanguageConfig metadata for each supported language', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const config = LANGUAGE_CONFIGS[lang];
        expect(config).toBeDefined();
        expect(config.id).toBe(lang);
        expect(config.name).toBeTruthy();
        expect(config.version).toBeTruthy();
        expect(config.monacoLanguage).toBeTruthy();
        expect(config.extension.startsWith('.')).toBe(true);
        expect(config.sourceFileName).toBeTruthy();
        expect(config.defaultImage).toBeTruthy();
        expect(typeof config.isCompiled).toBe('boolean');
        expect(config.starterCode).toBeTruthy();
      }
    });

    it('provides valid competitive programming starter code handling standard I/O', () => {
      // JavaScript
      expect(STARTER_CODE.javascript).toContain("readFileSync(0, 'utf8')");
      expect(STARTER_CODE.javascript).toContain('console.log');

      // Python
      expect(STARTER_CODE.python).toContain('sys.stdin.read()');
      expect(STARTER_CODE.python).toContain('print(');

      // C
      expect(STARTER_CODE.c).toContain('#include <stdio.h>');
      expect(STARTER_CODE.c).toContain('fgets(');
      expect(STARTER_CODE.c).toContain('printf(');

      // C++
      expect(STARTER_CODE.cpp).toContain('#include <iostream>');
      expect(STARTER_CODE.cpp).toContain('cin.tie(NULL)');
      expect(STARTER_CODE.cpp).toContain('cout <<');

      // Java
      expect(STARTER_CODE.java).toContain('public class Main');
      expect(STARTER_CODE.java).toContain('Scanner scanner = new Scanner(System.in)');
      expect(STARTER_CODE.java).toContain('System.out.println');

      // Go
      expect(STARTER_CODE.go).toContain('package main');
      expect(STARTER_CODE.go).toContain('bufio.NewScanner(os.Stdin)');
      expect(STARTER_CODE.go).toContain('fmt.Println');

      // Rust
      expect(STARTER_CODE.rust).toContain('use std::io::{self, BufRead}');
      expect(STARTER_CODE.rust).toContain('io::stdin()');
      expect(STARTER_CODE.rust).toContain('println!');
    });

    it('correctly categorizes compiled vs interpreted languages', () => {
      expect(isCompiledLanguage('javascript')).toBe(false);
      expect(isCompiledLanguage('python')).toBe(false);
      expect(isCompiledLanguage('c')).toBe(true);
      expect(isCompiledLanguage('cpp')).toBe(true);
      expect(isCompiledLanguage('java')).toBe(true);
      expect(isCompiledLanguage('go')).toBe(true);
      expect(isCompiledLanguage('rust')).toBe(true);
    });

    it('defines compiler specifications for all compiled languages', () => {
      const compiled = ['c', 'cpp', 'java', 'go', 'rust'] as const;
      for (const lang of compiled) {
        const spec = COMPILER_SPECS[lang];
        expect(spec).toBeDefined();
        expect(spec.isCompiled).toBe(true);
        expect(spec.compileCommand('src', 'bin')).toBeTruthy();
        expect(spec.runCommand('bin', 128)).toBeTruthy();
      }
    });
  });

  describe('Docker Isolation & Security Flags (buildDockerArgs)', () => {
    it('generates secure container isolation flags for all seven languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const args = buildDockerArgs({
          containerName: `test-box-${lang}`,
          language: lang,
          memoryLimitMb: 128,
          cpus: '0.5',
          pidsLimit: 64,
        });

        // Common security flags across all languages
        expect(args).toContain('--rm');
        expect(args).toContain('--network');
        expect(args).toContain('none');
        expect(args).toContain('--memory=128m');
        expect(args).toContain('--memory-swap=128m');
        expect(args).toContain('--cpus=0.5');
        expect(args).toContain('--pids-limit=64');
        expect(args).toContain('--read-only');
        expect(args).toContain('/tmp:rw,noexec,nosuid,size=16m');
        expect(args).toContain('--cap-drop');
        expect(args).toContain('ALL');
        expect(args).toContain('--security-opt');
        expect(args).toContain('no-new-privileges');
        expect(args).toContain('--user');
        expect(args).toContain('1000:1000');

        // Socket protection: Untrusted code must never access docker.sock
        expect(args.join(' ')).not.toContain('docker.sock');
      }
    });

    it('preserves exact legacy arguments for JavaScript and Python', () => {
      const jsArgs = buildDockerArgs({
        containerName: 'box-js',
        language: 'javascript',
        memoryLimitMb: 128,
        cpus: '0.5',
        pidsLimit: 64,
      });
      expect(jsArgs).toContain('node:20-alpine');
      expect(jsArgs).toContain('node');
      expect(jsArgs).toContain('-e');
      // JS only mounts /tmp
      expect(jsArgs).not.toContain('/sandbox:rw,exec,nosuid,size=64m,uid=1000,gid=1000,mode=0700');

      const pyArgs = buildDockerArgs({
        containerName: 'box-py',
        language: 'python',
        memoryLimitMb: 128,
        cpus: '0.5',
        pidsLimit: 64,
      });
      expect(pyArgs).toContain('python:3.11-alpine');
      expect(pyArgs).toContain('python3');
      expect(pyArgs).toContain('-I');
      expect(pyArgs).toContain('-c');
      expect(pyArgs).not.toContain('/sandbox:rw,exec,nosuid,size=64m,uid=1000,gid=1000,mode=0700');
    });

    it('mounts dedicated executable /sandbox tmpfs for compiled languages without weakening /tmp', () => {
      const compiledLangs: SupportedLanguage[] = ['c', 'cpp', 'java', 'go', 'rust'];
      for (const lang of compiledLangs) {
        const args = buildDockerArgs({
          containerName: `box-${lang}`,
          language: lang,
          memoryLimitMb: 128,
          cpus: '0.5',
          pidsLimit: 64,
        });

        // Dedicated executable sandbox workspace
        expect(args).toContain('/sandbox:rw,exec,nosuid,size=64m,uid=1000,gid=1000,mode=0700');
        // /tmp remains strictly noexec
        expect(args).toContain('/tmp:rw,noexec,nosuid,size=16m');
        // Working directory set to /sandbox
        expect(args).toContain('-w');
        expect(args).toContain('/sandbox');
        // Shell entrypoint
        expect(args).toContain('sh');
        expect(args).toContain('-c');
      }
    });

    it('uses correct default container images for all compiled languages', () => {
      expect(getDefaultImageForLanguage('c')).toBe('gcc:13-alpine');
      expect(getDefaultImageForLanguage('cpp')).toBe('gcc:13-alpine');
      expect(getDefaultImageForLanguage('java')).toBe('eclipse-temurin:21-alpine');
      expect(getDefaultImageForLanguage('go')).toBe('golang:1.22-alpine');
      expect(getDefaultImageForLanguage('rust')).toBe('rust:1.77-alpine');
    });

    it('allows custom Docker image overrides per execution', () => {
      const customArgs = buildDockerArgs({
        containerName: 'custom-cpp',
        language: 'cpp',
        memoryLimitMb: 128,
        cpus: '0.5',
        pidsLimit: 64,
        image: 'custom-judge-cpp:latest',
      });
      expect(customArgs).toContain('custom-judge-cpp:latest');
      expect(customArgs).not.toContain('gcc:13-alpine');
    });
  });

  describe('Compiler Script & Stdin Protocol (compilers.ts)', () => {
    it('detects Java class names accurately from user source code', () => {
      expect(detectJavaClassName('public class Solution { public static void main...')).toBe(
        'Solution'
      );
      expect(detectJavaClassName('public class TwoSum {\n...')).toBe('TwoSum');
      expect(detectJavaClassName('class MySolver { ... }')).toBe('MySolver');
      expect(detectJavaClassName('// No class declaration here')).toBe('Main');
    });

    it('encodes code and input into safe base64 delimiter payload', () => {
      const code = 'int main() { return 0; }';
      const input = '42\nhello world\n';
      const payload = formatCompiledStdinPayload(code, input);

      expect(payload).toContain('---CODE---\n');
      expect(payload).toContain('---INPUT---\n');
      expect(payload).toContain('---END---\n');

      const codeMatch = payload.match(/---CODE---\n([A-Za-z0-9+/=]+)\n---INPUT---/);
      expect(codeMatch).toBeTruthy();
      expect(Buffer.from(codeMatch![1], 'base64').toString('utf8')).toBe(code);

      const inputMatch = payload.match(/---INPUT---\n([A-Za-z0-9+/=]+)\n---END---/);
      expect(inputMatch).toBeTruthy();
      expect(Buffer.from(inputMatch![1], 'base64').toString('utf8')).toBe(input);
    });

    it('generates two-stage compile-and-run scripts for C and C++', () => {
      const cScript = buildCompiledRunnerScript('c', 128);
      expect(cScript).toContain(
        'gcc -O2 -std=c11 -Wall -Wextra -static -o /sandbox/prog /sandbox/main.c -lm'
      );
      expect(cScript).toContain('COMPILE_STATUS=$?');
      expect(cScript).toContain(COMPILE_ERROR_MARKER);
      expect(cScript).toContain('/sandbox/prog < /sandbox/.judge_stdin');

      const cppScript = buildCompiledRunnerScript('cpp', 128);
      expect(cppScript).toContain(
        'g++ -O2 -std=c++17 -Wall -Wextra -static -o /sandbox/prog /sandbox/main.cpp'
      );
      expect(cppScript).toContain('COMPILE_STATUS=$?');
      expect(cppScript).toContain('/sandbox/prog < /sandbox/.judge_stdin');
    });

    it('generates two-stage compile-and-run scripts for Java with class name detection', () => {
      const javaScript = buildCompiledRunnerScript('java', 128, 'public class Solution { ... }');
      expect(javaScript).toContain('javac -d /sandbox /sandbox/Solution.java');
      expect(javaScript).toContain(
        'java -Xms16m -XX:+UseSerialGC -cp /sandbox Solution < /sandbox/.judge_stdin'
      );
    });

    it('generates compile-and-run scripts for Go and Rust with isolated cache paths', () => {
      const goScript = buildCompiledRunnerScript('go', 128);
      expect(goScript).toContain('export GOCACHE=/sandbox/.cache');
      expect(goScript).toContain('export GOPATH=/sandbox/go');
      expect(goScript).toContain('go build -o /sandbox/prog /sandbox/main.go');

      const rustScript = buildCompiledRunnerScript('rust', 128);
      expect(rustScript).toContain('export CARGO_HOME=/sandbox/.cargo');
      expect(rustScript).toContain('export RUSTUP_HOME=/sandbox/.rustup');
      expect(rustScript).toContain('rustc -O -o /sandbox/prog /sandbox/main.rs');
    });
  });

  describe('Verdict Classification & Error Diagnostic Mapping', () => {
    it('classifies exit code 65 and COMPILE_ERROR_MARKER as COMPILATION_ERROR', () => {
      const result = classifySandboxOutcome({
        timedOut: false,
        outputExceeded: false,
        error: new Error('Command failed') as any,
        exitCode: 65,
        rawStdout: '',
        rawStderr: `${COMPILE_ERROR_MARKER}\nmain.c:2:5: error: expected ';' before 'return'`,
        durationMs: 85,
        memoryLimitMb: 128,
      });

      expect(result.verdict).toBe(Verdict.COMPILATION_ERROR);
      expect(result.stderr).toContain("main.c:2:5: error: expected ';' before 'return'");
      expect(result.stderr).not.toContain(COMPILE_ERROR_MARKER);
      expect(result.exitCode).toBe(65);
    });

    it('classifies unhandled runtime crashes as RUNTIME_ERROR', () => {
      const result = classifySandboxOutcome({
        timedOut: false,
        outputExceeded: false,
        error: new Error('Command failed with signal SIGSEGV') as any,
        exitCode: 139,
        rawStdout: 'Partial output',
        rawStderr: 'Segmentation fault (core dumped)',
        durationMs: 40,
        memoryLimitMb: 128,
      });

      expect(result.verdict).toBe(Verdict.RUNTIME_ERROR);
      expect(result.stdout).toBe('Partial output');
      expect(result.stderr).toBe('Segmentation fault (core dumped)');
      expect(result.exitCode).toBe(139);
    });

    it('classifies execution timeout as TIME_LIMIT_EXCEEDED', () => {
      const result = classifySandboxOutcome({
        timedOut: true,
        outputExceeded: false,
        error: null,
        exitCode: null,
        rawStdout: '',
        rawStderr: '',
        durationMs: 2005,
        memoryLimitMb: 128,
      });

      expect(result.verdict).toBe(Verdict.TIME_LIMIT_EXCEEDED);
      expect(result.stderr).toBe('Time Limit Exceeded');
      expect(result.executionTimeMs).toBe(2005);
    });

    it('classifies cgroup OOM and 137 exit code as MEMORY_LIMIT_EXCEEDED', () => {
      const result = classifySandboxOutcome({
        timedOut: false,
        outputExceeded: false,
        oomKilled: true,
        error: new Error('killed') as any,
        exitCode: 137,
        rawStdout: '',
        rawStderr: 'Killed',
        durationMs: 90,
        memoryLimitMb: 128,
      });

      expect(result.verdict).toBe(Verdict.MEMORY_LIMIT_EXCEEDED);
      expect(result.stderr).toBe('Memory Limit Exceeded');
      expect(result.memoryUsedKb).toBeGreaterThanOrEqual(128 * 1024);
    });

    it('classifies Docker daemon disconnect as INTERNAL_ERROR with failure category', () => {
      const err = new Error('Cannot connect to the Docker daemon at unix:///var/run/docker.sock');
      const result = classifySandboxOutcome({
        timedOut: false,
        outputExceeded: false,
        error: err as any,
        exitCode: 1,
        rawStdout: '',
        rawStderr: '',
        durationMs: 10,
        memoryLimitMb: 128,
      });

      expect(result.verdict).toBe(Verdict.INTERNAL_ERROR);
      expect(result.infraFailureCategory).toBe('DOCKER_DAEMON_UNAVAILABLE');
    });

    it('classifies clean exit code 0 as ACCEPTED with extracted memory markers', () => {
      const result = classifySandboxOutcome({
        timedOut: false,
        outputExceeded: false,
        error: null,
        exitCode: 0,
        rawStdout: '42\n',
        rawStderr: '\n__JUDGE_MEMORY_KB:18432__\n',
        durationMs: 35,
        memoryLimitMb: 128,
      });

      expect(result.verdict).toBe(Verdict.ACCEPTED);
      expect(result.stdout).toBe('42\n');
      expect(result.stderr).toBe('');
      expect(result.memoryUsedKb).toBe(18432);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Multi-Language Submission Pipeline (Executor Integration)', () => {
    it('executes C++ submission across test cases and stops early on failure', async () => {
      const mockSandboxRunner = vi
        .fn()
        .mockResolvedValueOnce({
          verdict: Verdict.ACCEPTED,
          stdout: '3\n',
          stderr: '',
          executionTimeMs: 15,
          memoryUsedKb: 4096,
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          verdict: Verdict.WRONG_ANSWER,
          stdout: '4\n',
          stderr: '',
          executionTimeMs: 16,
          memoryUsedKb: 4096,
          exitCode: 0,
        });

      const executor = new Executor(mockSandboxRunner);
      const evaluated = await executor.execute(
        {
          submissionId: crypto.randomUUID(),
          problemId: crypto.randomUUID(),
          code: '#include <iostream>\nint main() { ... }',
          language: 'cpp',
          timeLimitMs: 2000,
          memoryLimitMb: 128,
          retryCount: 0,
        },
        [
          { index: 0, input: '1 2', expectedOutput: '3', isHidden: false },
          { index: 1, input: '2 2', expectedOutput: '5', isHidden: true },
          { index: 2, input: '3 3', expectedOutput: '6', isHidden: true },
        ]
      );

      expect(evaluated.finalVerdict).toBe(Verdict.WRONG_ANSWER);
      expect(evaluated.failedTestIndex).toBe(1);
      // Stopped early after test index 1, never ran index 2 (AC-SJ-03)
      expect(mockSandboxRunner).toHaveBeenCalledTimes(2);
      expect(evaluated.results).toHaveLength(3);
      expect(evaluated.results[2].verdict).toBe(Verdict.NOT_EXECUTED);
    });

    it('halts immediately on COMPILATION_ERROR at test case 0', async () => {
      const mockSandboxRunner = vi.fn().mockResolvedValueOnce({
        verdict: Verdict.COMPILATION_ERROR,
        stdout: '',
        stderr: 'main.rs:1:1: error: expected function',
        executionTimeMs: 25,
        memoryUsedKb: 0,
        exitCode: 65,
      });

      const executor = new Executor(mockSandboxRunner);
      const evaluated = await executor.execute(
        {
          submissionId: crypto.randomUUID(),
          problemId: crypto.randomUUID(),
          code: 'fn malformed...',
          language: 'rust',
          timeLimitMs: 2000,
          memoryLimitMb: 128,
          retryCount: 0,
        },
        [
          { index: 0, input: '1', expectedOutput: '1', isHidden: false },
          { index: 1, input: '2', expectedOutput: '2', isHidden: true },
        ]
      );

      expect(evaluated.finalVerdict).toBe(Verdict.COMPILATION_ERROR);
      expect(evaluated.failedTestIndex).toBe(0);
      expect(mockSandboxRunner).toHaveBeenCalledTimes(1);
      expect(evaluated.results).toHaveLength(2);
      expect(evaluated.results[1].verdict).toBe(Verdict.NOT_EXECUTED);
    });
  });

  describe('Zod Validation for All 7 Languages', () => {
    it('accepts valid submission payloads for all seven languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const parsed = createSubmissionSchema.safeParse({
          problemId: crypto.randomUUID(),
          code: STARTER_CODE[lang],
          language: lang,
        });
        expect(parsed.success).toBe(true);
      }
    });

    it('accepts sample run payloads for all seven languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const parsed = runSampleSchema.safeParse({
          problemId: crypto.randomUUID(),
          code: STARTER_CODE[lang],
          language: lang,
        });
        expect(parsed.success).toBe(true);
      }
    });

    it('rejects unsupported languages cleanly with validation error', () => {
      const parsed = createSubmissionSchema.safeParse({
        problemId: crypto.randomUUID(),
        code: 'echo "hello"',
        language: 'php',
      });
      expect(parsed.success).toBe(false);
    });
  });
});
