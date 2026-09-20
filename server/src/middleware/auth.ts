import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Errors } from '../lib/errors';
import { asyncHandler } from '../lib/async-handler';
import { verifyAccessToken } from '../lib/tokens';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function loadUserFromToken(token: string): Promise<{ user: AuthUser; exp: number }> {
  const payload = verifyAccessToken(token);
  // The role claim in the JWT is deliberately ignored. The database is the source of truth, so a
  // stale (or, if the secret ever leaked, forged) role claim can never widen access, and a
  // deactivated user is locked out immediately instead of when their token expires.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw Errors.unauthorized('Account not found or disabled');
  const { isActive: _isActive, ...authUser } = user;
  return { user: authUser, exp: payload.exp };
}

/** Requires a valid Bearer access token and attaches `req.user`. */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) throw Errors.unauthorized();
  const { user } = await loadUserFromToken(header.slice('Bearer '.length).trim());
  req.user = user;
  next();
});

/** Role gate. Must run after `authenticate`. Enforced on the API, never only in the UI. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.includes(req.user.role)) return next(Errors.forbidden());
    next();
  };

/** Handlers behind `authenticate` can rely on this instead of `req.user!`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw Errors.unauthorized();
  return req.user;
}
