import { runInSandbox } from './sandbox/runner.js';

console.log('[Judge-Worker] Host-run worker process initialized.');
console.log('[Judge-Worker] Ready to consume BullMQ submission jobs.');

export { runInSandbox };
