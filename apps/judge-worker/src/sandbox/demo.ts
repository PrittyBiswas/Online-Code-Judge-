import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInSandbox } from './runner.js';

interface AttackScenario {
  name: string;
  codePath: string;
  expectedVerdict: string;
  input: string;
}

const ATTACK_ROOT = resolve('../../attack-suite');

const scenarios: AttackScenario[] = [
  {
    name: 'Infinite Loop → TLE',
    codePath: `${ATTACK_ROOT}/infinite-loop/index.js`,
    expectedVerdict: 'TIME_LIMIT_EXCEEDED',
    input: '',
  },
  {
    name: 'Memory Bomb → MLE',
    codePath: `${ATTACK_ROOT}/memory-bomb/index.js`,
    expectedVerdict: 'MEMORY_LIMIT_EXCEEDED',
    input: '',
  },
  {
    name: 'Output Flood → OLE',
    codePath: `${ATTACK_ROOT}/output-flood/index.js`,
    expectedVerdict: 'OUTPUT_LIMIT_EXCEEDED',
    input: '',
  },
  {
    name: 'Network Attempt → RE',
    codePath: `${ATTACK_ROOT}/network-attempt/index.js`,
    expectedVerdict: 'RUNTIME_ERROR',
    input: '',
  },
  {
    name: 'Happy Path: 2 + 3 = 5',
    codePath: '',
    expectedVerdict: 'ACCEPTED',
    input: '2 3',
  },
];

// Inline happy-path code
const happyPathCode = `
const lines = [];
process.stdin.on('data', d => lines.push(d));
process.stdin.on('end', () => {
  const [a, b] = lines.join('').trim().split(/\\s+/).map(Number);
  console.log(a + b);
});
`;

async function runAttackSuite(): Promise<void> {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   SANDBOX ATTACK SUITE VERIFICATION  ║');
  console.log('╚══════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    let code: string;
    try {
      code = scenario.codePath
        ? readFileSync(scenario.codePath, 'utf-8')
        : happyPathCode;
    } catch {
      console.log(`⚠️  Skipping "${scenario.name}" — attack file not found at ${scenario.codePath}`);
      console.log('   (Run from monorepo root or ensure attack-suite/ exists)\n');
      continue;
    }

    process.stdout.write(`  Testing: ${scenario.name} ... `);

    const result = await runInSandbox({
      code,
      input: scenario.input,
      timeLimitMs: 2000,
      memoryLimitMb: 128,
    });

    const isPass = result.verdict === scenario.expectedVerdict;
    if (isPass) {
      passed++;
      console.log(`✅ PASS  (verdict: ${result.verdict}, time: ${result.executionTimeMs}ms)`);
    } else {
      failed++;
      console.log(`❌ FAIL  (expected: ${scenario.expectedVerdict}, got: ${result.verdict})`);
      if (result.stderr) {
        console.log(`         stderr: ${result.stderr.substring(0, 120)}`);
      }
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error('  ⚠️  Some sandbox security checks FAILED. Review docker flags.\n');
    process.exit(1);
  } else {
    console.log('  🔒 All sandbox security checks PASSED.\n');
  }
}

runAttackSuite().catch((err) => {
  console.error('Demo runner error:', err);
  process.exit(1);
});
