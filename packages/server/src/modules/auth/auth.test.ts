import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyToken } from '../../utils/jwt.js';

describe('jwt', () => {
  it('signs and verifies an access token', () => {
    const token = signAccessToken({ userId: 'u1', organizationId: 'o1', role: 'owner' });
    const payload = verifyToken(token);
    expect(payload.userId).toBe('u1');
    expect(payload.organizationId).toBe('o1');
    expect(payload.role).toBe('owner');
    expect(payload.type).toBe('access');
  });

  it('rejects malformed tokens', () => {
    expect(() => verifyToken('not-a-jwt')).toThrowError();
  });
});
