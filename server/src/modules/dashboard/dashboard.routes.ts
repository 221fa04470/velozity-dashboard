import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, currentUser } from '../../middleware/auth';
import { getDashboard } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

// One endpoint, three shapes: what you get depends on your role (decided server-side).
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await getDashboard(currentUser(req)));
  }),
);
