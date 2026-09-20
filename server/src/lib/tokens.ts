import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { Errors } from './errors';

export interface AccessPayload {
  sub: number;
  role: Role;
  exp: number;
}

export function signAccessToken(user: { id: number; role: Role }): string {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: String(user.id),
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub || typeof decoded.exp !== 'number') {
      throw Errors.unauthorized('Invalid access token', 'TOKEN_INVALID');
    }
    const id = Number(decoded.sub);
    if (!Number.isInteger(id)) throw Errors.unauthorized('Invalid access token', 'TOKEN_INVALID');
    return { sub: id, role: decoded.role as Role, exp: decoded.exp };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw Errors.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw Errors.unauthorized('Invalid access token', 'TOKEN_INVALID');
    }
    throw err;
  }
}

export function signRefreshToken(userId: number): { token: string; expiresAt: Date } {
  const ttlSeconds = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
  const token = jwt.sign({ jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    subject: String(userId),
    expiresIn: ttlSeconds,
    algorithm: 'HS256',
  });
  return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
}

export function verifyRefreshToken(token: string): { sub: number } {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) throw new Error('bad payload');
    return { sub: Number(decoded.sub) };
  } catch {
    throw Errors.unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');
  }
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
