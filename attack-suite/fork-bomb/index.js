// attack-suite/fork-bomb/index.js
// Expected verdict: RUNTIME_ERROR or TIME_LIMIT_EXCEEDED
// Tests: --pids-limit=64 Docker flag prevents unbounded process creation
const { execSync } = require('child_process');
// Attempt a classic fork bomb via child_process
function forkBomb() {
  try {
    execSync('node -e "require(\'child_process\').execSync(\'node -e exit\')"');
    forkBomb();
  } catch (_) {
    forkBomb();
  }
}
forkBomb();

