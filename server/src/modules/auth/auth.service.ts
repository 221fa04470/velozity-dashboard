import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens';

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

const toPublicUser = (u: PublicUser): PublicUser => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

async function issueSession(user: PublicUser & { id: number }) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt } = signRefreshToken(user.id);
  // Only a hash of the refresh token is stored.
  await prisma.refreshToken.create({ data: { tokenHash: hashToken(refreshToken), userId: user.id, expiresAt } });
  return { accessToken, refreshToken, refreshExpiresAt: expiresAt, user: toPublicUser(user) };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !passwordOk) {
    throw Errors.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  return issueSession(user);
}

/**
 * Refresh-token rotation with reuse detection:
 *  - every refresh revokes the presented token and hands out a new one
 *  - presenting an already-revoked token means it was copied/stolen -> revoke ALL of that user's sessions
 */
export async function refresh(rawToken: string) {
  const { sub } = verifyRefreshToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!stored || stored.userId !== sub) throw Errors.unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw Errors.unauthorized('Refresh token was already used. Please sign in again.', 'REFRESH_REUSED');
  }
  if (stored.expiresAt.getTime() < Date.now() || !stored.user.isActive) {
    throw Errors.unauthorized('Session expired. Please sign in again.', 'REFRESH_INVALID');
  }

  // Atomic compare-and-set: if two requests race with the same token only one can win.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) throw Errors.unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');

  return issueSession(stored.user);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function purgeExpiredRefreshTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
