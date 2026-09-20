import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, currentUser } from '../../middleware/auth';
import { listNotifications, markAllRead, markRead } from './notifications.service';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
const idParams = z.object({ id: z.coerce.number().int().positive() });

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit } = listQuery.parse(req.query);
    res.json(await listNotifications(currentUser(req), limit));
  }),
);

// Declared before "/:id/read" so "read-all" is never parsed as an id.
notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    res.json(await markAllRead(currentUser(req)));
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json(await markRead(currentUser(req), id));
  }),
);
