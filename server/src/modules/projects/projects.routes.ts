import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import {
  createProjectSchema,
  listProjectsQuery,
  projectIdParams,
  updateProjectSchema,
} from './projects.schemas';
import { createProject, deleteProject, getProject, listProjects, updateProject } from './projects.service';

export const projectsRouter = Router();

projectsRouter.use(authenticate);

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listProjects(currentUser(req), listProjectsQuery.parse(req.query)));
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = projectIdParams.parse(req.params);
    res.json(await getProject(currentUser(req), id));
  }),
);

projectsRouter.post(
  '/',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createProject(currentUser(req), createProjectSchema.parse(req.body)));
  }),
);

projectsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = projectIdParams.parse(req.params);
    res.json(await updateProject(currentUser(req), id, updateProjectSchema.parse(req.body)));
  }),
);

projectsRouter.delete(
  '/:id',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = projectIdParams.parse(req.params);
    await deleteProject(currentUser(req), id);
    res.status(204).end();
  }),
);
