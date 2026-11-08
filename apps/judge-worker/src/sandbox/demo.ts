import { runInSandbox } from './runner.js';

async function main() {
  console.log('=====================================================');
  console.log('       WEEK 1 DEMO: SANDBOX CONTAINER RUNNER        ');
  console.log('=====================================================\n');

  // Test 1: Simple valid submission
  console.log('--> Running Test 1: Valid Code (Simple Math)...');
  const result1 = await runInSandbox({
    code: `console.log(2 + 2);`,
    input: '',
    timeLimitMs: 2000,
  });
  console.log(`Result 1 Verdict: ${result1.verdict}`);
  console.log(`Output: ${result1.stdout.trim()}`);
  console.log(`Duration: ${result1.executionTimeMs}ms\n`);

  // Test 2: Infinite loop (AC-SAFE-01)
  console.log('--> Running Test 2: Hostile Infinite Loop (while(true){})...');
  const result2 = await runInSandbox({
    code: `while(true) {}`,
    input: '',
    timeLimitMs: 1500, // 1.5s timeout
  });
  console.log(`Result 2 Verdict: ${result2.verdict}`);
  console.log(`Duration: ${result2.executionTimeMs}ms`);
  console.log(`Error/Stderr: ${result2.stderr}\n`);

  console.log('=====================================================');
  console.log('WEEK 1 DEMO FINISHED SUCCESSFULLY!');
  console.log('=====================================================');
}

main().catch(console.error);

