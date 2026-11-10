import { Router } from 'express';
import { contestsController } from './contests.controller.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { Role } from '@judge/shared';

const router = Router();

router.get('/', optionalAuth, (req, res, next) => contestsController.list(req, res, next));
router.get('/:id', optionalAuth, (req, res, next) => contestsController.getOne(req, res, next));
router.get('/:id/leaderboard', optionalAuth, (req, res, next) =>
  contestsController.getLeaderboard(req, res, next)
);

router.post('/', requireAuth, requireRole(Role.ADMIN), (req, res, next) =>
  contestsController.create(req, res, next)
);

export const contestsRouter = router;
