import { Router } from 'express';
import { usersController } from './users.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

// Authenticated current user profile endpoints
router.get('/me', requireAuth, (req, res, next) => usersController.getMyProfile(req, res, next));
router.put('/me', requireAuth, (req, res, next) => usersController.updateMyProfile(req, res, next));
router.post('/me/avatar', requireAuth, (req, res, next) =>
  usersController.uploadAvatar(req, res, next)
);
router.delete('/me/avatar', requireAuth, (req, res, next) =>
  usersController.deleteAvatar(req, res, next)
);

// Public avatar serving endpoint
router.get('/avatar/*', (req, res, next) => usersController.getAvatar(req, res, next));

// Public/authenticated user by ID endpoint
router.get('/:id', requireAuth, (req, res, next) => usersController.getProfile(req, res, next));

export const usersRouter = router;
