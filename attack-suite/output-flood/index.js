// attack-suite/output-flood/index.js
// Expected verdict: OUTPUT_LIMIT_EXCEEDED
// Tests: 64 KB stdout cap enforced by host worker's output stream monitor
const line = 'A'.repeat(1000) + '\n'; // 1001 bytes per line
let totalBytes = 0;
while (true) {
  process.stdout.write(line);
  totalBytes += line.length;
  // This loop never terminates by itself — the host worker kills it
  // when accumulated stdout exceeds MAX_OUTPUT_BYTES (65536)
}
