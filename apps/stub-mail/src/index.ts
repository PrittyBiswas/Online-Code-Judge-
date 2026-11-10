import express from 'express';

const app = express();
const PORT = process.env.STUB_MAIL_PORT || 4005;

app.use(express.json());

// Controllable failure flags for testing resilience
let failureRate = 0; // 0 to 1

app.post('/mail/send', (req, res) => {
  if (Math.random() < failureRate) {
    return res.status(500).json({ error: 'Simulated email delivery failure' });
  }
  console.log('[Stub-Mail] Simulated email sent:', req.body);
  return res.status(200).json({ status: 'sent', id: `mock-email-${Date.now()}` });
});

app.post('/mail/set-failure-rate', (req, res) => {
  failureRate = Number(req.body.rate) || 0;
  res.json({ status: 'ok', failureRate });
});

app.listen(PORT, () => {
  console.log(`[Stub-Mail] Service listening on port ${PORT}`);
});
