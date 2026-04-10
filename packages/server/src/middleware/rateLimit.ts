import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const userRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_USER_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'anon',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests from user' } },
});

export const orgRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_ORG_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.organizationId ?? req.ip ?? 'anon',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests from organization' } },
});
