import { Router } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { opportunities, opportunityStageHistory, activities } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { analyzeDealHealth } from '../ai/dealAnalyzer.js';

export const opportunitiesRouter = Router();

const opportunitySchema = z.object({
  leadId: z.string().uuid(),
  contactId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  stage: z
    .enum([
      'discovery',
      'qualification',
      'proposal',
      'negotiation',
      'verbal_commit',
      'closed_won',
      'closed_lost',
    ])
    .optional(),
  estimatedValue: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
});

opportunitiesRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.organizationId, req.auth!.organizationId),
          isNull(opportunities.deletedAt),
        ),
      );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

opportunitiesRouter.post('/', validateBody(opportunitySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof opportunitySchema>;
    const [created] = await db
      .insert(opportunities)
      .values({
        ...body,
        organizationId: req.auth!.organizationId,
        estimatedValue: body.estimatedValue?.toString(),
      })
      .returning();

    if (created) {
      await db.insert(activities).values({
        organizationId: req.auth!.organizationId,
        leadId: created.leadId,
        contactId: created.contactId,
        userId: req.auth!.userId,
        activityType: 'deal_created',
        description: `Opportunity "${created.title}" created`,
      });
    }

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

opportunitiesRouter.get('/:id', async (req, res, next) => {
  try {
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.id, req.params.id!),
          eq(opportunities.organizationId, req.auth!.organizationId),
          isNull(opportunities.deletedAt),
        ),
      )
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity');

    const history = await db
      .select()
      .from(opportunityStageHistory)
      .where(eq(opportunityStageHistory.opportunityId, opp.id));

    res.json({ ...opp, history });
  } catch (err) {
    next(err);
  }
});

const stageSchema = z.object({
  stage: z.enum([
    'discovery',
    'qualification',
    'proposal',
    'negotiation',
    'verbal_commit',
    'closed_won',
    'closed_lost',
  ]),
  notes: z.string().optional(),
  closeReason: z.string().optional(),
  lossReason: z.string().optional(),
});

opportunitiesRouter.post(
  '/:id/stage',
  validateBody(stageSchema),
  async (req, res, next) => {
    try {
      const [existing] = await db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, req.params.id!),
            eq(opportunities.organizationId, req.auth!.organizationId),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundError('Opportunity');

      const body = req.body as z.infer<typeof stageSchema>;
      const now = new Date();

      const [updated] = await db
        .update(opportunities)
        .set({
          stage: body.stage,
          stageChangedAt: now,
          updatedAt: now,
          closeReason: body.closeReason,
          lossReason: body.lossReason,
          actualCloseDate:
            body.stage === 'closed_won' || body.stage === 'closed_lost'
              ? now.toISOString().slice(0, 10)
              : existing.actualCloseDate,
        })
        .where(eq(opportunities.id, existing.id))
        .returning();

      await db.insert(opportunityStageHistory).values({
        opportunityId: existing.id,
        fromStage: existing.stage,
        toStage: body.stage,
        changedByUserId: req.auth!.userId,
        notes: body.notes,
      });

      await db.insert(activities).values({
        organizationId: req.auth!.organizationId,
        leadId: existing.leadId,
        contactId: existing.contactId,
        userId: req.auth!.userId,
        activityType:
          body.stage === 'closed_won'
            ? 'deal_won'
            : body.stage === 'closed_lost'
              ? 'deal_lost'
              : 'deal_stage_changed',
        description: `Stage changed ${existing.stage} → ${body.stage}`,
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

opportunitiesRouter.post('/:id/analyze', async (req, res, next) => {
  try {
    const analysis = await analyzeDealHealth(req.params.id!, req.auth!.organizationId);
    await db
      .update(opportunities)
      .set({ aiDealAnalysis: analysis, updatedAt: new Date() })
      .where(eq(opportunities.id, req.params.id!));
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});
