import { Router } from 'express';
import { authController } from './auth.controller.js';
import { optionalAuth } from '../../middleware/auth.js';

const router = Router();

router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/logout', (req, res) => authController.logout(req, res));
router.get('/me', optionalAuth, (req, res) => authController.me(req, res));

export const authRouter = router;

