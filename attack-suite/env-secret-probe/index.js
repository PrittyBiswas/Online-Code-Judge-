// attack-suite/env-secret-probe/index.js (SAFE-07 / SAFE-09)
// Expected verdict: ACCEPTED (outputs container security metadata for inspection)
const fs = require('fs');

const statusText = fs.readFileSync('/proc/self/status', 'utf8');
const capEffMatch = statusText.match(/^CapEff:\s*(.+)$/m);
const noNewPrivsMatch = statusText.match(/^NoNewPrivs:\s*(.+)$/m);

console.log(
  JSON.stringify({
    uid: process.getuid ? process.getuid() : null,
    gid: process.getgid ? process.getgid() : null,
    capEff: capEffMatch ? capEffMatch[1].trim() : null,
    noNewPrivs: noNewPrivsMatch ? noNewPrivsMatch[1].trim() : null,
    envKeys: Object.keys(process.env),
  })
);

