import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../lib/async-handler';
import { Errors } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';

export const usersRouter = Router();

const idParams = z.object({ id: z.coerce.number().int().positive() });
const password = z.string().min(8, 'Password must be at least 8 characters').max(100);

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password,
  role: z.nativeEnum(Role),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: z.nativeEnum(Role),
    isActive: z.boolean(),
    password,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });
const listQuery = z.object({
  role: z.nativeEnum(Role).optional(),
  active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

const select = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } as const;

usersRouter.use(authenticate);

// Admin: the whole directory. PM: active developers only (needed to assign tasks).
usersRouter.get(
  '/',
  requireRole('ADMIN', 'PROJECT_MANAGER'),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const q = listQuery.parse(req.query);
    const where =
      user.role === 'ADMIN'
        ? { ...(q.role ? { role: q.role } : {}), ...(q.active !== undefined ? { isActive: q.active } : {}) }
        : { role: 'DEVELOPER' as const, isActive: true };
    const rows = await prisma.user.findMany({ where, orderBy: [{ role: 'asc' }, { name: 'asc' }], select });
    res.json({ data: rows });
  }),
);

usersRouter.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const input = createBody.parse(req.body);
    const created = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
      select,
    });
    res.status(201).json(created);
  }),
);

usersRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const { id } = idParams.parse(req.params);
    const input = updateBody.parse(req.body);

    if (id === admin.id && (input.role !== undefined || input.isActive === false)) {
      throw Errors.badRequest('You cannot change your own role or deactivate your own account');
    }
    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw Errors.notFound('User');

    const { password: newPassword, ...rest } = input;
    const updated = await prisma.user.update({
      where: { id },
      data: { ...rest, ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 12) } : {}) },
      select,
    });

    // Deactivation, role change or password reset ends every existing session for that user.
    if (input.isActive === false || input.role !== undefined || newPassword) {
      await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    res.json(updated);
  }),
);
