import client from 'prom-client';

// Create a Registry which registers the metrics
export const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'online-code-judge',
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom metrics as required by AC-OP-02
export const queueLengthGauge = new client.Gauge({
  name: 'judge_queue_length',
  help: 'Current number of submissions waiting in the BullMQ queue',
  registers: [register],
});

export const verdictCounter = new client.Counter({
  name: 'judge_verdicts_total',
  help: 'Total count of completed submission verdicts',
  labelNames: ['verdict'],
  registers: [register],
});

export const judgeDurationHistogram = new client.Histogram({
  name: 'judge_duration_seconds',
  help: 'Histogram of submission execution and evaluation duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const containerStartFailureCounter = new client.Counter({
  name: 'judge_container_start_failures_total',
  help: 'Total count of Docker container startup failures',
  registers: [register],
});

