import { SupportedLanguage } from '@judge/shared';
import { workerEnv } from '../config/env.js';

export const COMPILE_ERROR_MARKER = '__JUDGE_COMPILE_ERROR__';
export const MEMORY_MARKER_REGEX = /\n?__JUDGE_MEMORY_KB:(\d+)__\n?/g;

export interface CompilerSpec {
  language: SupportedLanguage;
  isCompiled: boolean;
  defaultSourceFile: string;
  compileCommand: (sourceFile: string, binaryFile: string) => string;
  runCommand: (binaryFile: string, memoryLimitMb: number, sourceFile?: string) => string;
  extraEnv?: string[];
}

export function detectJavaClassName(code: string): string {
  // Strip single-line and multi-line comments
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const publicClassMatch = stripped.match(/(?:^|\s)public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (publicClassMatch && publicClassMatch[1]) {
    return publicClassMatch[1];
  }
  const classMatch = stripped.match(/(?:^|\s)class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (classMatch && classMatch[1]) {
    return classMatch[1];
  }
  return 'Main';
}

export function getSourceFileName(language: SupportedLanguage, code?: string): string {
  switch (language) {
    case 'javascript':
      return 'solution.js';
    case 'python':
      return 'solution.py';
    case 'c':
      return 'main.c';
    case 'cpp':
      return 'main.cpp';
    case 'java':
      return code ? `${detectJavaClassName(code)}.java` : 'Main.java';
    case 'go':
      return 'main.go';
    case 'rust':
      return 'main.rs';
  }
}

export const COMPILER_SPECS: Record<'c' | 'cpp' | 'java' | 'go' | 'rust', CompilerSpec> = {
  c: {
    language: 'c',
    isCompiled: true,
    defaultSourceFile: 'main.c',
    compileCommand: (src, bin) => `gcc -O2 -std=c11 -Wall -Wextra -static -o ${bin} ${src} -lm`,
    runCommand: (bin) => `${bin}`,
    extraEnv: ['export HOME=/sandbox'],
  },
  cpp: {
    language: 'cpp',
    isCompiled: true,
    defaultSourceFile: 'main.cpp',
    compileCommand: (src, bin) => `g++ -O2 -std=c++17 -Wall -Wextra -static -o ${bin} ${src}`,
    runCommand: (bin) => `${bin}`,
    extraEnv: ['export HOME=/sandbox'],
  },
  java: {
    language: 'java',
    isCompiled: true,
    defaultSourceFile: 'Main.java',
    compileCommand: (src) => `javac -J-Xms16m -J-Xmx128m -J-XX:+UseSerialGC -d /sandbox ${src}`,
    runCommand: (_bin, _mem, src) => {
      const className = src
        ? src
            .replace(/\.java$/, '')
            .split('/')
            .pop() || 'Main'
        : 'Main';
      return `java -Xms16m -Xmx128m -XX:+UseSerialGC -cp /sandbox ${className}`;
    },
    extraEnv: ['export HOME=/sandbox'],
  },
  go: {
    language: 'go',
    isCompiled: true,
    defaultSourceFile: 'main.go',
    compileCommand: (src, bin) => `go build -o ${bin} ${src}`,
    runCommand: (bin) => `${bin}`,
    extraEnv: [
      'export HOME=/sandbox',
      'export GOCACHE=/sandbox/.cache',
      'export GOPATH=/sandbox/go',
      'mkdir -p /sandbox/.tmp',
      'export GOTMPDIR=/sandbox/.tmp',
      'export GOMAXPROCS=1',
      'export GOMEMLIMIT=350MiB',
    ],
  },
  rust: {
    language: 'rust',
    isCompiled: true,
    defaultSourceFile: 'main.rs',
    compileCommand: (src, bin) => `rustc -O -o ${bin} ${src}`,
    runCommand: (bin) => `${bin}`,
    extraEnv: ['export HOME=/sandbox', 'export CARGO_HOME=/sandbox/.cargo'],
  },
};

export function getDefaultImageForLanguage(language: SupportedLanguage): string {
  switch (language) {
    case 'javascript':
      return workerEnv.SANDBOX_DOCKER_IMAGE;
    case 'python':
      return workerEnv.SANDBOX_PYTHON_IMAGE;
    case 'c':
      return workerEnv.SANDBOX_C_IMAGE;
    case 'cpp':
      return workerEnv.SANDBOX_CPP_IMAGE;
    case 'java':
      return workerEnv.SANDBOX_JAVA_IMAGE;
    case 'go':
      return workerEnv.SANDBOX_GO_IMAGE;
    case 'rust':
      return workerEnv.SANDBOX_RUST_IMAGE;
  }
}

export function isCompiledLanguage(
  language: SupportedLanguage
): language is 'c' | 'cpp' | 'java' | 'go' | 'rust' {
  return language !== 'javascript' && language !== 'python';
}

export function formatCompiledStdinPayload(code: string, input: string): string {
  const codeB64 = Buffer.from(code, 'utf8').toString('base64');
  const inputB64 = Buffer.from(input, 'utf8').toString('base64');
  return `---CODE---\n${codeB64}\n---INPUT---\n${inputB64}\n---END---\n`;
}

export function buildCompiledRunnerScript(
  language: 'c' | 'cpp' | 'java' | 'go' | 'rust',
  memoryLimitMb: number,
  code?: string
): string {
  const spec = COMPILER_SPECS[language];
  const sourceFileName = getSourceFileName(language, code);
  const sourcePath = `/sandbox/${sourceFileName}`;
  const binaryPath = '/sandbox/prog';

  const envLines = spec.extraEnv && spec.extraEnv.length ? `${spec.extraEnv.join('\n')}\n` : '';
  const compileCmd = spec.compileCommand(sourcePath, binaryPath);
  const runCmd = spec.runCommand(binaryPath, memoryLimitMb, sourceFileName);

  return `${envLines}cat > /sandbox/.raw_payload
awk '/^---CODE---$/{f=1;next}/^---INPUT---$/{f=0}f' /sandbox/.raw_payload | base64 -d > ${sourcePath}
awk '/^---INPUT---$/{f=1;next}/^---END---$/{f=0}f' /sandbox/.raw_payload | base64 -d > /sandbox/.judge_stdin
rm -f /sandbox/.raw_payload
${compileCmd} 2> /sandbox/compile_err.txt
COMPILE_STATUS=$?
if [ $COMPILE_STATUS -ne 0 ]; then
  echo "${COMPILE_ERROR_MARKER}" >&2
  cat /sandbox/compile_err.txt >&2
  exit 65
fi
${runCmd} < /sandbox/.judge_stdin
RUN_STATUS=$?
MEM_KB=0
if [ -f /sys/fs/cgroup/memory.peak ]; then
  MEM_BYTES=$(cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo 0)
  MEM_KB=$((MEM_BYTES / 1024))
elif [ -f /sys/fs/cgroup/memory/memory.max_usage_in_bytes ]; then
  MEM_BYTES=$(cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes 2>/dev/null || echo 0)
  MEM_KB=$((MEM_BYTES / 1024))
fi
if [ "$MEM_KB" -gt 0 ]; then
  echo "" >&2
  echo "__JUDGE_MEMORY_KB:\${MEM_KB}__" >&2
fi
exit $RUN_STATUS`;
}
