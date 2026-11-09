import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { problemsRouter } from '../modules/problems/problems.routes.js';
import { submissionsRouter } from '../modules/submissions/submissions.routes.js';
import { leaderboardRouter } from '../modules/leaderboard/leaderboard.routes.js';
import { contestsRouter } from '../modules/contests/contests.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { sseRouter } from '../events/sse.js';

const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/problems', problemsRouter);
apiRouter.use('/submissions', submissionsRouter);
apiRouter.use('/submissions', sseRouter); // SSE endpoint: /api/submissions/:id/live
apiRouter.use('/leaderboard', leaderboardRouter);
apiRouter.use('/contests', contestsRouter);
apiRouter.use('/admin', adminRouter);

export { apiRouter };

