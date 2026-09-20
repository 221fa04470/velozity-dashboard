import { Router, type CookieOptions, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { asyncHandler } from '../../lib/async-handler';
import { Errors } from '../../lib/errors';
import { authenticate, currentUser } from '../../middleware/auth';
import { login, logout, refresh } from './auth.service';

export const authRouter = Router();

const REFRESH_COOKIE = 'refresh_token';

/**
 * The refresh token lives ONLY in this cookie: HttpOnly (JavaScript can't read it, so XSS can't
 * steal it), scoped to /api/auth (browsers don't attach it to any other request) and Secure in production.
 */
const baseCookie: CookieOptions = {
  httpOnly: true,
  secure: env.isProd || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/auth',
};

const setRefreshCookie = (res: Response, token: string, expiresAt: Date) =>
  res.cookie(REFRESH_COOKIE, token, { ...baseCookie, expires: expiresAt });
const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, baseCookie);

// Cookie-authenticated endpoints must be called by our own SPA: browsers can't attach a custom
// header cross-site without a CORS preflight, which only our allowed origins pass. (CSRF defence
// in depth on top of SameSite.)
const requireClientHeader = (req: Request, _res: Response, next: NextFunction) => {
  if (req.get('x-requested-with') !== 'velozity-client') return next(Errors.forbidden('Missing client header'));
  next();
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } }),
});

const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(200),
});

authRouter.post(
  '/login',
  loginLimiter,
  requireClientHeader,
  asyncHandler(async (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const session = await login(email, password);
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    res.json({ accessToken: session.accessToken, user: session.user });
  }),
);

authRouter.post(
  '/refresh',
  requireClientHeader,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw Errors.unauthorized('No active session', 'REFRESH_MISSING');
    try {
      const session = await refresh(token);
      setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
      res.json({ accessToken: session.accessToken, user: session.user });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

authRouter.post(
  '/logout',
  requireClientHeader,
  asyncHandler(async (req, res) => {
    await logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearRefreshCookie(res);
    res.status(204).end();
  }),
);

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: currentUser(req) });
});
