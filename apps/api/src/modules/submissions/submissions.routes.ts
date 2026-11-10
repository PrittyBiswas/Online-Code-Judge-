import { Router } from 'express';
import { submissionsController } from './submissions.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { submissionRateLimiter, doubleClickGuard } from '../../middleware/rate-limiter.js';

const router = Router();

router.post('/', requireAuth, submissionRateLimiter, doubleClickGuard, (req, res, next) =>
  submissionsController.submit(req, res, next)
);

router.post('/run-sample', requireAuth, (req, res, next) =>
  submissionsController.runSample(req, res, next)
);

router.get('/', requireAuth, (req, res, next) => submissionsController.list(req, res, next));
router.get('/:id', requireAuth, (req, res, next) => submissionsController.getOne(req, res, next));

export const submissionsRouter = router;
