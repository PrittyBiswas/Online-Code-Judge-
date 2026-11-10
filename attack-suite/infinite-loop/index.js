// attack-suite/infinite-loop/index.js
// Expected verdict: TIME_LIMIT_EXCEEDED
// Tests: Hard wall-clock kill signal from host worker
while (true) {
  // Busy-wait forever — must be killed by external timeout
}
