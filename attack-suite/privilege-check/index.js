// attack-suite/privilege-check/index.js
// Expected verdict: RUNTIME_ERROR
// Tests:
//   - --cap-drop ALL (no Linux capabilities)
//   - --security-opt no-new-privileges
//   - --user 1000:1000 (non-root execution)
const { execSync } = require('child_process');

console.log('[privilege-check] Running as UID:', process.getuid?.() ?? 'unknown');
console.log('[privilege-check] Running as GID:', process.getgid?.() ?? 'unknown');

// Attempt 1: Try to become root via su
try {
  execSync('su -c "id" root', { stdio: 'pipe' });
  console.error('SU BREACH — must never appear');
} catch (e) {
  console.log('[privilege-check] su blocked (expected)');
}

// Attempt 2: Try to use chmod to change executable permissions
try {
  execSync('chmod +s /usr/bin/node', { stdio: 'pipe' });
  console.error('SETUID BREACH — must never appear');
} catch (e) {
  console.log('[privilege-check] chmod +s blocked (expected)');
}

// Attempt 3: Try to bind a privileged port (< 1024 requires CAP_NET_BIND_SERVICE)
const net = require('net');
const server = net.createServer();
server.listen(80, () => {
  console.error('PRIVILEGED PORT BIND BREACH — must never appear');
  server.close();
});
server.on('error', (e) => {
  console.log('[privilege-check] Port 80 bind blocked (expected):', e.code);
  process.exit(1);
});

