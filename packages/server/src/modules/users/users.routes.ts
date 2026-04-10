import { Router } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import { users, invitations } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/auth.js';
import { NotFoundError } from '../../utils/errors.js';

export const usersRouter = Router();

usersRouter.get('/me', async (req, res, next) => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        avatarUrl: users.avatarUrl,
        preferences: users.preferences,
        organizationId: users.organizationId,
      })
      .from(users)
      .where(and(eq(users.id, req.auth!.userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw new NotFoundError('User');
    res.json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(and(eq(users.organizationId, req.auth!.organizationId), isNull(users.deletedAt)));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const updateMeSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional(),
  preferences: z.record(z.unknown()).optional(),
});

usersRouter.patch('/me', validateBody(updateMeSchema), async (req, res, next) => {
  try {
    const [updated] = await db
      .update(users)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(users.id, req.auth!.userId))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'member', 'viewer']),
});

usersRouter.post(
  '/invite',
  requireRole('owner', 'admin'),
  validateBody(inviteSchema),
  async (req, res, next) => {
    try {
      const token = nanoid(48);
      const [inv] = await db
        .insert(invitations)
        .values({
          organizationId: req.auth!.organizationId,
          email: req.body.email.toLowerCase(),
          role: req.body.role,
          invitedBy: req.auth!.userId,
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .returning();
      res.status(201).json(inv);
    } catch (err) {
      next(err);
    }
  },
);
