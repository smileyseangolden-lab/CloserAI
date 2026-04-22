import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: JwtPayload;
    requestId?: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  // Header-based auth (default).
  let rawToken: string | null = null;
  if (header?.startsWith('Bearer ')) {
    rawToken = header.slice(7);
  } else if (typeof req.query.token === 'string' && req.query.token.length > 0) {
    // Query-param fallback for browser EventSource, which cannot set headers.
    // Scoped to GET requests to avoid leaking in server logs for writes.
    if (req.method === 'GET') rawToken = req.query.token;
  }
  if (!rawToken) {
    return next(new UnauthorizedError('Missing access token'));
  }
  const payload = verifyToken(rawToken);
  if (payload.type !== 'access') {
    return next(new UnauthorizedError('Wrong token type'));
  }
  req.auth = payload;
  next();
}

type Role = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new UnauthorizedError());
    const userLevel = ROLE_HIERARCHY[req.auth.role as Role] ?? 0;
    const minLevel = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]));
    if (userLevel < minLevel) {
      return next(new ForbiddenError('Insufficient role'));
    }
    next();
  };
}
