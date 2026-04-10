import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { organizations } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/auth.js';
import { NotFoundError } from '../../utils/errors.js';
import { integrationsRouter } from './integrations.routes.js';

export const organizationsRouter = Router();

// Nest integration credential routes (Anthropic key, etc.) under
// /organizations/current/integrations/*
organizationsRouter.use('/current/integrations', integrationsRouter);

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
    // Explicit column list — encrypted secrets like encryptedAnthropicApiKey
    // must never leave the server, not even as ciphertext.
    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        industry: organizations.industry,
        website: organizations.website,
        description: organizations.description,
        logoUrl: organizations.logoUrl,
        subscriptionTier: organizations.subscriptionTier,
        subscriptionStatus: organizations.subscriptionStatus,
        trialEndsAt: organizations.trialEndsAt,
        settings: organizations.settings,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
      })
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
        .returning({
          id: organizations.id,
          name: organizations.name,
          industry: organizations.industry,
          website: organizations.website,
          description: organizations.description,
          logoUrl: organizations.logoUrl,
          settings: organizations.settings,
          updatedAt: organizations.updatedAt,
        });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);
