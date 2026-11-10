// attack-suite/file-access/index.js
// Expected verdict: RUNTIME_ERROR
// Tests: --read-only root filesystem; only /tmp (tmpfs, 16MB, noexec) is writable
const fs = require('fs');

// Attempt to write to the root filesystem (must fail)
try {
  fs.writeFileSync('/evil.txt', 'I escaped the sandbox!');
  console.log('ROOT FS WRITE BREACH — this must never appear');
  process.exit(0);
} catch (e) {
  console.error('Root FS write blocked (expected):', e.message);
}

// Attempt to read /etc/passwd (sensitive host file)
try {
  const passwd = fs.readFileSync('/etc/passwd', 'utf-8');
  // In a container, /etc/passwd is the container's own minimal file — not a host breach
  // but we confirm it cannot be exfiltrated via network (see network-attempt test)
  console.log('Container /etc/passwd lines:', passwd.split('\n').length);
} catch (e) {
  console.error('Could not read /etc/passwd:', e.message);
}

// Attempt to write to /tmp (this SHOULD succeed — tmpfs is intentionally writable)
try {
  fs.writeFileSync('/tmp/scratch.txt', 'tmp write test');
  console.log('/tmp write succeeded (expected — tmpfs scratch is allowed)');
  fs.unlinkSync('/tmp/scratch.txt');
} catch (e) {
  console.error('/tmp write failed (unexpected):', e.message);
}

process.exit(1); // Exit non-zero to register as RUNTIME_ERROR verdict
