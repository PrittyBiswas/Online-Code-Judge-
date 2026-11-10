import { Router } from 'express';
import { leaderboardController } from './leaderboard.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { Role } from '@judge/shared';

const router = Router();

router.get('/', (req, res, next) => leaderboardController.getLeaderboard(req, res, next));
router.post('/rebuild', requireAuth, requireRole(Role.ADMIN), (req, res, next) =>
  leaderboardController.rebuild(req, res, next)
);

export const leaderboardRouter = router;
