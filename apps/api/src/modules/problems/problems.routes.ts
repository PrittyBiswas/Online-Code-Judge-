import { Router } from 'express';
import { problemsController } from './problems.controller.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { Role } from '@judge/shared';

const router = Router();

router.get('/', optionalAuth, (req, res, next) => problemsController.list(req, res, next));
router.get('/:id', optionalAuth, (req, res, next) => problemsController.getOne(req, res, next));

// Setter & Admin protected endpoints
router.post('/', requireAuth, requireRole(Role.PROBLEM_SETTER, Role.ADMIN), (req, res, next) =>
  problemsController.create(req, res, next)
);

router.put('/:id', requireAuth, requireRole(Role.PROBLEM_SETTER, Role.ADMIN), (req, res, next) =>
  problemsController.update(req, res, next)
);

router.delete('/:id', requireAuth, requireRole(Role.PROBLEM_SETTER, Role.ADMIN), (req, res, next) =>
  problemsController.delete(req, res, next)
);

export const problemsRouter = router;
