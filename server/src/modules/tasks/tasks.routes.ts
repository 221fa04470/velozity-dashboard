import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import {
  createTaskSchema,
  taskIdParams,
  taskQuerySchema,
  updateStatusSchema,
  updateTaskSchema,
} from './tasks.schemas';
import { createTask, deleteTask, getTask, listTasks, updateTask, updateTaskStatus } from './tasks.service';

export const tasksRouter = Router();

tasksRouter.use(authenticate);

// Filters are plain query params (?status=IN_PROGRESS,IN_REVIEW&priority=HIGH&dueFrom=...&dueTo=...)
// so every filtered view is a shareable URL. Scope (who sees what) is applied inside the service.
tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listTasks(currentUser(req), taskQuerySchema.parse(req.query)));
  }),
);

tasksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = taskIdParams.parse(req.params);
    res.json(await getTask(currentUser(req), id));
  }),
);

tasksRouter.post(
  '/',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (req, res) => {
    const input = createTaskSchema.parse(req.body);
    res.status(201).json(await createTask(currentUser(req), input));
  }),
);

tasksRouter.patch(
  '/:id',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = taskIdParams.parse(req.params);
    const input = updateTaskSchema.parse(req.body);
    res.json(await updateTask(currentUser(req), id, input));
  }),
);

// Developers may ONLY change status, and only on tasks assigned to them (scope handles that).
tasksRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = taskIdParams.parse(req.params);
    const { status } = updateStatusSchema.parse(req.body);
    res.json(await updateTaskStatus(currentUser(req), id, status));
  }),
);

tasksRouter.delete(
  '/:id',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = taskIdParams.parse(req.params);
    await deleteTask(currentUser(req), id);
    res.status(204).end();
  }),
);
