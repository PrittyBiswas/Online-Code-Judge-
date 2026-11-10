import { Router } from 'express';
import { usersController } from './users.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

router.get('/:id', requireAuth, (req, res, next) => usersController.getProfile(req, res, next));

export const usersRouter = router;
