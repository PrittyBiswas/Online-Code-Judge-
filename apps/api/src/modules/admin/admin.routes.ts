import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { Role } from '@judge/shared';

const router = Router();

router.use(requireAuth, requireRole(Role.ADMIN));

router.get('/stats', (req, res, next) => adminController.getStats(req, res, next));
router.post('/submissions/:id/rejudge', (req, res, next) => adminController.rejudge(req, res, next));
router.post('/submissions/:id/kill', (req, res, next) => adminController.kill(req, res, next));

export const adminRouter = router;

