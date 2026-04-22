import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { complianceRules, deployments } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';

export const deploymentsRouter = Router();

// ---- deployments ----------------------------------------------------------

const deploymentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  assignedAgentIds: z.array(z.string().uuid()).optional(),
  icpTierIds: z.array(z.string().uuid()).optional(),
  campaignIds: z.array(z.string().uuid()).optional(),
  status: z
    .enum(['draft', 'pending_pilot', 'live', 'paused', 'completed'])
    .optional(),
  settings: z.record(z.unknown()).optional(),
});

deploymentsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.post('/', validateBody(deploymentSchema), async (req, res, next) => {
  try {
    const [row] = await db
      .insert(deployments)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.patch(
  '/:id',
  validateBody(deploymentSchema.partial()),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(deployments)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(deployments.id, req.params.id!),
            eq(deployments.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Deployment');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

const killSwitchSchema = z.object({ reason: z.string().optional() });

/** Emergency kill switch: flips deployment status + records who + when. */
deploymentsRouter.post(
  '/:id/kill',
  validateBody(killSwitchSchema),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(deployments)
        .set({
          status: 'paused',
          killSwitchActivatedAt: new Date(),
          killSwitchActivatedBy: req.auth!.userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(deployments.id, req.params.id!),
            eq(deployments.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Deployment');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

deploymentsRouter.post('/:id/resume', async (req, res, next) => {
  try {
    const [row] = await db
      .update(deployments)
      .set({
        status: 'live',
        killSwitchActivatedAt: null,
        killSwitchActivatedBy: null,
        launchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deployments.id, req.params.id!),
          eq(deployments.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError('Deployment');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ---- compliance_rules -----------------------------------------------------

const ruleSchema = z.object({
  jurisdiction: z.enum(['us_can_spam', 'eu_gdpr', 'us_ccpa', 'linkedin_tos', 'custom']),
  ruleType: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

deploymentsRouter.get('/compliance/rules', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(complianceRules)
      .where(eq(complianceRules.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.post(
  '/compliance/rules',
  validateBody(ruleSchema),
  async (req, res, next) => {
    try {
      const [row] = await db
        .insert(complianceRules)
        .values({ ...req.body, organizationId: req.auth!.organizationId })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

deploymentsRouter.patch(
  '/compliance/rules/:id',
  validateBody(ruleSchema.partial()),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(complianceRules)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(complianceRules.id, req.params.id!),
            eq(complianceRules.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Compliance rule');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

deploymentsRouter.delete('/compliance/rules/:id', async (req, res, next) => {
  try {
    await db
      .delete(complianceRules)
      .where(
        and(
          eq(complianceRules.id, req.params.id!),
          eq(complianceRules.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
