import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { organizations } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/auth.js';
import { NotFoundError } from '../../utils/errors.js';

export const organizationsRouter = Router();

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  industry: z.string().optional(),
  website: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).optional(),
});

organizationsRouter.get('/current', async (req, res, next) => {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.auth!.organizationId))
      .limit(1);
    if (!org) throw new NotFoundError('Organization');
    res.json(org);
  } catch (err) {
    next(err);
  }
});

organizationsRouter.patch(
  '/current',
  requireRole('owner', 'admin'),
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(organizations)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(organizations.id, req.auth!.organizationId))
        .returning();
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Org-wide outbound pause switch. When on, the campaign scheduler skips every
 * campaign_leads row belonging to this org on each tick, effectively freezing
 * all outbound without pausing individual campaigns / deployments.
 */
const pauseSchema = z.object({
  paused: z.boolean(),
  reason: z.string().max(500).optional(),
});

organizationsRouter.patch(
  '/current/pause-outbound',
  requireRole('owner', 'admin', 'manager'),
  validateBody(pauseSchema),
  async (req, res, next) => {
    try {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, req.auth!.organizationId))
        .limit(1);
      if (!org) throw new NotFoundError('Organization');
      const settings = ((org.settings ?? {}) as Record<string, unknown>) ?? {};
      settings.pauseOutbound = req.body.paused;
      if (req.body.paused) {
        settings.pausedAt = new Date().toISOString();
        settings.pausedByUserId = req.auth!.userId;
        settings.pauseReason = req.body.reason ?? null;
      } else {
        delete settings.pausedAt;
        delete settings.pausedByUserId;
        delete settings.pauseReason;
      }
      await db
        .update(organizations)
        .set({ settings, updatedAt: new Date() })
        .where(eq(organizations.id, req.auth!.organizationId));
      res.json({
        paused: req.body.paused,
        pausedAt: settings.pausedAt ?? null,
        pauseReason: settings.pauseReason ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

organizationsRouter.get('/current/pause-outbound', async (req, res, next) => {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.auth!.organizationId))
      .limit(1);
    if (!org) throw new NotFoundError('Organization');
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    res.json({
      paused: settings.pauseOutbound === true,
      pausedAt: (settings.pausedAt as string) ?? null,
      pauseReason: (settings.pauseReason as string) ?? null,
    });
  } catch (err) {
    next(err);
  }
});
