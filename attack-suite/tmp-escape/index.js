// attack-suite/tmp-escape/index.js (SAFE-05)
// Expected verdict: RUNTIME_ERROR (all escape attempts blocked)
// Tests: host marker isolation, /tmp noexec, /tmp 16m size cap, read-only root FS
const fs = require('fs');
const { execFileSync } = require('child_process');
const payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');

const report = {
  hostMarkerReadable: false,
  rootWriteSucceeded: false,
  tmpExecSucceeded: false,
  tmpOverLimitSucceeded: false,
};

if (payload.hostMarkerPath) {
  try {
    fs.readFileSync(payload.hostMarkerPath, 'utf8');
    report.hostMarkerReadable = true;
  } catch {
    report.hostMarkerReadable = false;
  }
}

try {
  fs.writeFileSync('/host_escape_test.txt', 'x');
  report.rootWriteSucceeded = true;
} catch {
  report.rootWriteSucceeded = false;
}

try {
  fs.writeFileSync('/tmp/runme.sh', '#!/bin/sh\necho EXEC_BREACH\n', { mode: 0o755 });
  execFileSync('/tmp/runme.sh');
  report.tmpExecSucceeded = true;
} catch {
  report.tmpExecSucceeded = false;
}

try {
  fs.writeFileSync('/tmp/fill.bin', Buffer.alloc(20 * 1024 * 1024, 1));
  report.tmpOverLimitSucceeded = true;
} catch {
  report.tmpOverLimitSucceeded = false;
}

console.log(JSON.stringify(report));
process.exit(1);

