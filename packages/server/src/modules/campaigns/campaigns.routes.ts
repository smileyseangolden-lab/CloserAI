import { Router } from 'express';
import { and, eq, isNull, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  campaigns,
  cadenceSteps,
  campaignLeads,
  leads,
  contacts,
} from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';

export const campaignsRouter = Router();

const campaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  campaignType: z.enum([
    'outbound_cold',
    'nurture_warm',
    're_engagement',
    'event_follow_up',
    'closing',
    'custom',
  ]),
  icpId: z.string().uuid().optional(),
  assignedAgentId: z.string().uuid().optional(),
  closingAgentId: z.string().uuid().optional(),
  strategy: z
    .enum(['educational', 'direct', 'social_proof', 'pain_point', 'challenger', 'value_first'])
    .optional(),
  channels: z.array(z.string()).optional(),
  abTestEnabled: z.boolean().optional(),
  dailySendLimit: z.number().int().min(1).max(10000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  warmLeadThreshold: z.number().int().min(0).max(100).optional(),
  autoCloseEnabled: z.boolean().optional(),
  humanHandoffEnabled: z.boolean().optional(),
  handoffUserId: z.string().uuid().optional(),
});

campaignsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.organizationId, req.auth!.organizationId),
          isNull(campaigns.deletedAt),
        ),
      )
      .orderBy(desc(campaigns.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/', validateBody(campaignSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(campaigns)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get('/:id', async (req, res, next) => {
  try {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, req.params.id!),
          eq(campaigns.organizationId, req.auth!.organizationId),
          isNull(campaigns.deletedAt),
        ),
      )
      .limit(1);
    if (!campaign) throw new NotFoundError('Campaign');

    const steps = await db
      .select()
      .from(cadenceSteps)
      .where(eq(cadenceSteps.campaignId, campaign.id))
      .orderBy(asc(cadenceSteps.stepNumber));

    res.json({ ...campaign, steps });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.patch('/:id', validateBody(campaignSchema.partial()), async (req, res, next) => {
  try {
    const [updated] = await db
      .update(campaigns)
      .set({ ...req.body, updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, req.params.id!),
          eq(campaigns.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundError('Campaign');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/:id/start', async (req, res, next) => {
  try {
    const [updated] = await db
      .update(campaigns)
      .set({ status: 'active', updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, req.params.id!),
          eq(campaigns.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post('/:id/pause', async (req, res, next) => {
  try {
    const [updated] = await db
      .update(campaigns)
      .set({ status: 'paused', updatedAt: new Date() })
      .where(
        and(
          eq(campaigns.id, req.params.id!),
          eq(campaigns.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// --- Cadence steps ---
const stepSchema = z.object({
  stepNumber: z.number().int().min(1),
  channel: z.enum([
    'email',
    'linkedin_connection',
    'linkedin_message',
    'linkedin_comment',
    'phone_call',
    'sms',
    'delay',
  ]),
  delayDays: z.number().int().min(0).default(0),
  delayHours: z.number().int().min(0).default(0),
  subjectTemplate: z.string().optional(),
  bodyTemplate: z.string().min(1),
  aiPersonalizationEnabled: z.boolean().optional(),
  personalizationInstructions: z.string().optional(),
  abVariant: z.enum(['A', 'B']).optional(),
  skipIfReplied: z.boolean().optional(),
  skipIfOpened: z.boolean().optional(),
});

campaignsRouter.post('/:id/steps', validateBody(stepSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(cadenceSteps)
      .values({ ...req.body, campaignId: req.params.id! })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.patch(
  '/:id/steps/:stepId',
  validateBody(stepSchema.partial()),
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(cadenceSteps)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(cadenceSteps.id, req.params.stepId!),
            eq(cadenceSteps.campaignId, req.params.id!),
          ),
        )
        .returning();
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

campaignsRouter.delete('/:id/steps/:stepId', async (req, res, next) => {
  try {
    await db
      .delete(cadenceSteps)
      .where(
        and(
          eq(cadenceSteps.id, req.params.stepId!),
          eq(cadenceSteps.campaignId, req.params.id!),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// --- Enroll leads ---
const enrollSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1),
});

campaignsRouter.post('/:id/enroll', validateBody(enrollSchema), async (req, res, next) => {
  try {
    const leadIds = (req.body as z.infer<typeof enrollSchema>).leadIds;
    // For each lead, find primary contact and enroll
    const rows: Array<typeof campaignLeads.$inferInsert> = [];
    for (const leadId of leadIds) {
      const [primary] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.leadId, leadId),
            isNull(contacts.deletedAt),
            eq(contacts.isPrimary, true),
          ),
        )
        .limit(1);
      if (!primary) continue;
      rows.push({
        campaignId: req.params.id!,
        leadId,
        contactId: primary.id,
        status: 'queued',
        nextStepScheduledAt: new Date(),
      });
    }
    if (rows.length === 0) return res.json({ enrolled: 0 });
    const inserted = await db.insert(campaignLeads).values(rows).returning();
    res.status(201).json({ enrolled: inserted.length });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get('/:id/leads', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        campaignLead: campaignLeads,
        lead: leads,
        contact: contacts,
      })
      .from(campaignLeads)
      .innerJoin(leads, eq(campaignLeads.leadId, leads.id))
      .innerJoin(contacts, eq(campaignLeads.contactId, contacts.id))
      .where(eq(campaignLeads.campaignId, req.params.id!));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
