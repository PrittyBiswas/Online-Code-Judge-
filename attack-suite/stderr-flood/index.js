// attack-suite/stderr-flood/index.js (SAFE-06)
// Expected verdict: OUTPUT_LIMIT_EXCEEDED
// Tests: 64 KB combined stdout + stderr cap enforced by host worker
const chunk = 'E'.repeat(1000) + '\n';
while (true) {
  process.stderr.write(chunk);
}

