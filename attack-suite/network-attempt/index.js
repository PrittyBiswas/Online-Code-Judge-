// attack-suite/network-attempt/index.js
// Expected verdict: RUNTIME_ERROR
// Tests: --network none — zero external/internal network access
const http = require('http');
const req = http.get('http://google.com', (res) => {
  console.log('NETWORK BREACH — this must never appear');
  process.exit(0);
});
req.on('error', (err) => {
  // This is the expected path: network is unreachable
  console.error('Network blocked (expected):', err.message);
  process.exit(1);
});
