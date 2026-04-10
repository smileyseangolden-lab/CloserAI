import bcrypt from 'bcrypt';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { organizations, users } from '../../db/schema.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../../utils/jwt.js';
import { ConflictError, UnauthorizedError } from '../../utils/errors.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const BCRYPT_COST = 12;

export async function register(input: RegisterInput) {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, input.email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const [org] = await db
    .insert(organizations)
    .values({
      name: input.organizationName,
      website: input.website,
      subscriptionTier: 'free',
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning();

  if (!org) throw new Error('Organization creation failed');

  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'owner',
    })
    .returning();

  if (!user) throw new Error('User creation failed');

  return issueTokens(user.id, org.id, user.role);
}

export async function login(input: LoginInput) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, input.email.toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new UnauthorizedError('Invalid credentials');

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  return issueTokens(user.id, user.organizationId, user.role);
}

export async function refresh(refreshToken: string) {
  const payload = verifyToken(refreshToken);
  if (payload.type !== 'refresh') throw new UnauthorizedError('Wrong token type');

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.userId), isNull(users.deletedAt)))
    .limit(1);

  if (!user || !user.isActive) throw new UnauthorizedError('User no longer active');

  return issueTokens(user.id, user.organizationId, user.role);
}

function issueTokens(userId: string, organizationId: string, role: string) {
  const accessToken = signAccessToken({ userId, organizationId, role });
  const refreshToken = signRefreshToken({ userId, organizationId, role });
  return { accessToken, refreshToken };
}
