// attack-suite/memory-bomb/index.js
// Expected verdict: MEMORY_LIMIT_EXCEEDED (exit code 137 / SIGKILL from OOM)
// Tests: --memory=128m --memory-swap=128m Docker limits
const chunks = [];
while (true) {
  // Allocate 10 MB chunks continuously until OOM kill
  chunks.push(Buffer.alloc(10 * 1024 * 1024, 0xff));
}
