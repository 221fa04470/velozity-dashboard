import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, currentUser } from '../../middleware/auth';
import { getMissedActivity, listActivity, markActivitySeen } from './activity.service';
import { listActivityQuery } from './activity.schemas';

export const activityRouter = Router();

activityRouter.use(authenticate);

// Role-scoped feed: admin = everything, PM = own projects, developer = own tasks.
activityRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listActivityQuery.parse(req.query);
    res.json(await listActivity(currentUser(req), query));
  }),
);

// Events that happened since the user's last live connection (max 20, from the DB).
activityRouter.get(
  '/missed',
  asyncHandler(async (req, res) => {
    res.json(await getMissedActivity(currentUser(req)));
  }),
);

activityRouter.post(
  '/seen',
  asyncHandler(async (req, res) => {
    await markActivitySeen(currentUser(req));
    res.status(204).end();
  }),
);
