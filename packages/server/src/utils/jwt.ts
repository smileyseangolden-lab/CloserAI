import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

export interface JwtPayload {
  userId: string;
  organizationId: string;
  role: string;
  type: 'access' | 'refresh';
}

export function signAccessToken(payload: Omit<JwtPayload, 'type'>): string {
  const opts: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, opts);
}

export function signRefreshToken(payload: Omit<JwtPayload, 'type'>): string {
  const opts: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
