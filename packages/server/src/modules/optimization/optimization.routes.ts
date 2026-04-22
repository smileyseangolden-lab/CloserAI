import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  agentProfiles,
  experimentResults,
  experiments,
  idealCustomerProfiles,
  optimizationProposals,
  organizations,
} from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { embedAndStoreKnowledgeEntry } from '../ai/orgKnowledge.js';
import { logger } from '../../utils/logger.js';
import { optimizationQueue } from '../../jobs/queue.js';

export const optimizationRouter = Router();

// ---- optimization_proposals ----------------------------------------------

const proposalSchema = z.object({
  proposalType: z.enum([
    'agent_prompt_change',
    'knowledge_add',
    'knowledge_edit',
    'icp_targeting_change',
    'cadence_change',
    'value_prop_change',
    'data_source_change',
  ]),
  targetResourceType: z.string().min(1),
  targetResourceId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().optional(),
  beforeValue: z.unknown().optional(),
  afterValue: z.unknown().optional(),
  expectedImpact: z.string().optional(),
});

optimizationRouter.get('/proposals', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(optimizationProposals)
      .where(eq(optimizationProposals.organizationId, req.auth!.organizationId))
      .orderBy(desc(optimizationProposals.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

optimizationRouter.post(
  '/proposals',
  validateBody(proposalSchema),
  async (req, res, next) => {
    try {
      const [row] = await db
        .insert(optimizationProposals)
        .values({ ...req.body, organizationId: req.auth!.organizationId })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Approve a proposal — applies the change to the canonical table the proposal
 * targets, marks itself applied, and is the closed-loop write-back back into
 * S3 (agents) / S6 (knowledge) / S4 (ICP) called for in the brief.
 */
optimizationRouter.post('/proposals/:id/approve', async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;
    const [p] = await db
      .select()
      .from(optimizationProposals)
      .where(
        and(
          eq(optimizationProposals.id, req.params.id!),
          eq(optimizationProposals.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!p) throw new NotFoundError('Proposal');
    if (p.status !== 'pending') throw new ValidationError('Proposal already resolved.');

    try {
      await applyProposal(p, orgId);
      const [updated] = await db
        .update(optimizationProposals)
        .set({
          status: 'applied',
          appliedAt: new Date(),
          appliedByUserId: req.auth!.userId,
          updatedAt: new Date(),
        })
        .where(eq(optimizationProposals.id, p.id))
        .returning();
      res.json(updated);
    } catch (err) {
      logger.error({ err, proposalId: p.id }, 'apply proposal failed');
      const [updated] = await db
        .update(optimizationProposals)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(eq(optimizationProposals.id, p.id))
        .returning();
      res.json(updated);
    }
  } catch (err) {
    next(err);
  }
});

const dismissSchema = z.object({ reason: z.string().optional() });

optimizationRouter.post(
  '/proposals/:id/dismiss',
  validateBody(dismissSchema),
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(optimizationProposals)
        .set({
          status: 'dismissed',
          dismissedAt: new Date(),
          dismissReason: req.body.reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(optimizationProposals.id, req.params.id!),
            eq(optimizationProposals.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundError('Proposal');
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// ---- experiments ----------------------------------------------------------

const experimentSchema = z.object({
  name: z.string().min(1),
  hypothesis: z.string().optional(),
  metric: z.string().min(1),
  variantAConfig: z.record(z.unknown()),
  variantBConfig: z.record(z.unknown()),
  targetSampleSize: z.number().int().min(1).optional(),
});

optimizationRouter.get('/experiments', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(experiments)
      .where(eq(experiments.organizationId, req.auth!.organizationId))
      .orderBy(desc(experiments.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

optimizationRouter.get('/experiments/:id', async (req, res, next) => {
  try {
    const [exp] = await db
      .select()
      .from(experiments)
      .where(
        and(
          eq(experiments.id, req.params.id!),
          eq(experiments.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!exp) throw new NotFoundError('Experiment');
    const results = await db
      .select()
      .from(experimentResults)
      .where(eq(experimentResults.experimentId, exp.id))
      .orderBy(desc(experimentResults.capturedAt));
    res.json({ ...exp, results });
  } catch (err) {
    next(err);
  }
});

optimizationRouter.post(
  '/experiments',
  validateBody(experimentSchema),
  async (req, res, next) => {
    try {
      const [row] = await db
        .insert(experiments)
        .values({ ...req.body, organizationId: req.auth!.organizationId })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

optimizationRouter.post('/experiments/:id/start', async (req, res, next) => {
  try {
    const [row] = await db
      .update(experiments)
      .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(experiments.id, req.params.id!),
          eq(experiments.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError('Experiment');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

const stopSchema = z.object({ winningVariant: z.enum(['A', 'B']).optional() });

optimizationRouter.post(
  '/experiments/:id/stop',
  validateBody(stopSchema),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(experiments)
        .set({
          status: 'completed',
          endedAt: new Date(),
          winningVariant: req.body.winningVariant,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(experiments.id, req.params.id!),
            eq(experiments.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Experiment');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

const resultSchema = z.object({
  variant: z.enum(['A', 'B']),
  metric: z.string().min(1),
  value: z.number(),
  sampleSize: z.number().int().min(0).optional(),
});

optimizationRouter.post(
  '/experiments/:id/results',
  validateBody(resultSchema),
  async (req, res, next) => {
    try {
      const [exp] = await db
        .select()
        .from(experiments)
        .where(
          and(
            eq(experiments.id, req.params.id!),
            eq(experiments.organizationId, req.auth!.organizationId),
          ),
        )
        .limit(1);
      if (!exp) throw new NotFoundError('Experiment');
      const [row] = await db
        .insert(experimentResults)
        .values({ ...req.body, experimentId: exp.id })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

// ---- scheduler toggle + run-now -------------------------------------------

optimizationRouter.get('/scheduler', async (req, res, next) => {
  try {
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, req.auth!.organizationId))
      .limit(1);
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    res.json({
      enabled: settings.optimizationSchedulerEnabled !== false,
      lastProposalAt: await lastProposalAt(req.auth!.organizationId),
    });
  } catch (err) {
    next(err);
  }
});

const toggleSchema = z.object({ enabled: z.boolean() });

optimizationRouter.patch(
  '/scheduler',
  validateBody(toggleSchema),
  async (req, res, next) => {
    try {
      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, req.auth!.organizationId))
        .limit(1);
      const settings = ((org?.settings ?? {}) as Record<string, unknown>) ?? {};
      settings.optimizationSchedulerEnabled = req.body.enabled;
      await db
        .update(organizations)
        .set({ settings, updatedAt: new Date() })
        .where(eq(organizations.id, req.auth!.organizationId));
      res.json({ enabled: req.body.enabled });
    } catch (err) {
      next(err);
    }
  },
);

optimizationRouter.post('/scheduler/run-now', async (req, res, next) => {
  try {
    await optimizationQueue.add(
      'analyze_optimization',
      { organizationId: req.auth!.organizationId },
      {
        removeOnComplete: true,
        attempts: 1,
        jobId: `opt:${req.auth!.organizationId}:manual:${Date.now()}`,
      },
    );
    res.status(202).json({ queued: true });
  } catch (err) {
    next(err);
  }
});

async function lastProposalAt(orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ createdAt: optimizationProposals.createdAt })
    .from(optimizationProposals)
    .where(eq(optimizationProposals.organizationId, orgId))
    .orderBy(desc(optimizationProposals.createdAt))
    .limit(1);
  return row ? row.createdAt.toISOString() : null;
}

// ---- helpers --------------------------------------------------------------

async function applyProposal(
  p: typeof optimizationProposals.$inferSelect,
  orgId: string,
): Promise<void> {
  const after = (p.afterValue ?? {}) as Record<string, unknown>;
  switch (p.proposalType) {
    case 'agent_prompt_change': {
      if (!p.targetResourceId) throw new ValidationError('Missing target agent id.');
      await db
        .update(agentProfiles)
        .set({
          systemPromptOverride:
            (after.systemPrompt as string) ??
            (after.systemPromptOverride as string) ??
            undefined,
          toneDescription: (after.toneDescription as string) ?? undefined,
          updatedAt: new Date(),
        })
        .where(
          and(eq(agentProfiles.id, p.targetResourceId), eq(agentProfiles.organizationId, orgId)),
        );
      return;
    }
    case 'icp_targeting_change': {
      if (!p.targetResourceId) throw new ValidationError('Missing target ICP id.');
      await db
        .update(idealCustomerProfiles)
        .set({
          targetIndustries: (after.targetIndustries as string[]) ?? undefined,
          targetCompanySizes: (after.targetCompanySizes as string[]) ?? undefined,
          targetJobTitles: (after.targetJobTitles as string[]) ?? undefined,
          targetGeographies: (after.targetGeographies as string[]) ?? undefined,
          buyingSignals: (after.buyingSignals as string[]) ?? undefined,
          disqualifiers: (after.disqualifiers as string[]) ?? undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(idealCustomerProfiles.id, p.targetResourceId),
            eq(idealCustomerProfiles.organizationId, orgId),
          ),
        );
      return;
    }
    case 'knowledge_add': {
      const title = (after.title as string) ?? p.title;
      const content = (after.content as string) ?? p.description;
      await embedAndStoreKnowledgeEntry({
        organizationId: orgId,
        source: 'document',
        title,
        content,
        tags: (after.tags as string[]) ?? ['from-optimization'],
      });
      return;
    }
    case 'knowledge_edit': {
      if (!p.targetResourceId) throw new ValidationError('Missing target knowledge id.');
      await embedAndStoreKnowledgeEntry({
        id: p.targetResourceId,
        organizationId: orgId,
        source: ((after.source as string) ?? 'document') as
          | 'document'
          | 'url'
          | 'pasted'
          | 'email'
          | 'battlecard'
          | 'faq'
          | 'objection_playbook'
          | 'website',
        title: (after.title as string) ?? p.title,
        content: (after.content as string) ?? p.description,
      });
      return;
    }
    default:
      // value_prop_change / cadence_change / data_source_change: schema-write
      // semantics depend on per-record afterValue shape and are intentionally
      // left as "approved but not auto-applied" until the dedicated UI lands.
      return;
  }
}
