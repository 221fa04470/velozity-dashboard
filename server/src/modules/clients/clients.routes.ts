import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';

export const clientsRouter = Router();

const idParams = z.object({ id: z.coerce.number().int().positive() });
const clientBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  contactName: z.string().trim().max(150).nullable().optional(),
  contactEmail: z.string().trim().email('Enter a valid email').max(200).nullable().optional(),
});
const clientPatch = clientBody.partial().refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

const select = { id: true, name: true, contactName: true, contactEmail: true, createdAt: true, _count: { select: { projects: true } } };

clientsRouter.use(authenticate);

// Admins manage clients; PMs only need to read them to attach a project to one.
clientsRouter.get(
  '/',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.client.findMany({ orderBy: { name: 'asc' }, select });
    res.json({ data: rows.map(({ _count, ...c }) => ({ ...c, projectCount: _count.projects })) });
  }),
);

clientsRouter.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const input = clientBody.parse(req.body);
    const row = await prisma.client.create({ data: input, select });
    const { _count, ...c } = row;
    res.status(201).json({ ...c, projectCount: _count.projects });
  }),
);

clientsRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const input = clientPatch.parse(req.body);
    const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw Errors.notFound('Client');
    const { _count, ...c } = await prisma.client.update({ where: { id }, data: input, select });
    res.json({ ...c, projectCount: _count.projects });
  }),
);

clientsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = idParams.parse(req.params);
    const projects = await prisma.project.count({ where: { clientId: id } });
    if (projects > 0) throw Errors.conflict('This client still has projects. Move or delete them first.');
    const result = await prisma.client.deleteMany({ where: { id } });
    if (result.count === 0) throw Errors.notFound('Client');
    res.status(204).end();
  }),
);
