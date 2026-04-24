import { Router } from 'express';
import { and, eq, isNull, desc, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  campaigns,
  cadenceSteps,
  campaignLeads,
  leads,
  contacts,
  messages,
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

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

campaignsRouter.get('/', async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where = and(
      eq(campaigns.organizationId, req.auth!.organizationId),
      isNull(campaigns.deletedAt),
    );

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(campaigns)
        .where(where)
        .orderBy(desc(campaigns.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      db.select({ total: sql<number>`count(*)::int` }).from(campaigns).where(where),
    ]);

    res.json({ data: rows, total: totalRow[0]?.total ?? 0, limit: q.limit, offset: q.offset });
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

/**
 * Per-campaign analytics: top-line funnel (leads, warm, qualified, converted,
 * replied) and per-channel message totals (sent / opened / replied / bounced).
 *
 * Per-step breakdown requires tying each message to a specific cadence step.
 * We infer the step by joining on campaign_leads.current_step at the time of
 * send — not perfect because the counter advances, but close enough for a
 * rough funnel. If precision is needed later, stamp stepId on messages at
 * enqueue time and join on that.
 */
campaignsRouter.get('/:id/analytics', async (req, res, next) => {
  try {
    const campaignId = req.params.id!;
    const orgId = req.auth!.organizationId;

    const [existing] = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.organizationId, orgId),
          isNull(campaigns.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('Campaign');

    const [funnelRow] = await db
      .select({
        totalLeads: sql<number>`count(*)::int`,
        replied: sql<number>`count(*) filter (where ${campaignLeads.status} = 'replied')::int`,
        warm: sql<number>`count(*) filter (where ${campaignLeads.status} = 'warm')::int`,
        qualified: sql<number>`count(*) filter (where ${campaignLeads.status} = 'qualified')::int`,
        converted: sql<number>`count(*) filter (where ${campaignLeads.status} = 'converted')::int`,
        unsubscribed: sql<number>`count(*) filter (where ${campaignLeads.status} = 'unsubscribed')::int`,
      })
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, campaignId));

    const steps = await db
      .select()
      .from(cadenceSteps)
      .where(eq(cadenceSteps.campaignId, campaignId))
      .orderBy(asc(cadenceSteps.stepNumber));

    // Per-channel totals from messages that belong to any campaign_lead on
    // this campaign.
    const byChannel = await db
      .select({
        channel: messages.channel,
        sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
        opened: sql<number>`count(*) filter (where ${messages.openedAt} is not null)::int`,
        replied: sql<number>`count(*) filter (where ${messages.repliedAt} is not null)::int`,
        bounced: sql<number>`count(*) filter (where ${messages.bouncedAt} is not null)::int`,
      })
      .from(messages)
      .innerJoin(campaignLeads, eq(messages.campaignLeadId, campaignLeads.id))
      .where(
        and(
          eq(campaignLeads.campaignId, campaignId),
          eq(messages.organizationId, orgId),
        ),
      )
      .groupBy(messages.channel);

    const totals = byChannel.reduce(
      (acc, r) => ({
        sent: acc.sent + (r.sent ?? 0),
        opened: acc.opened + (r.opened ?? 0),
        replied: acc.replied + (r.replied ?? 0),
        bounced: acc.bounced + (r.bounced ?? 0),
      }),
      { sent: 0, opened: 0, replied: 0, bounced: 0 },
    );

    res.json({
      funnel: {
        totalLeads: funnelRow?.totalLeads ?? 0,
        replied: funnelRow?.replied ?? 0,
        warm: funnelRow?.warm ?? 0,
        qualified: funnelRow?.qualified ?? 0,
        converted: funnelRow?.converted ?? 0,
        unsubscribed: funnelRow?.unsubscribed ?? 0,
      },
      messages: {
        totals,
        byChannel,
      },
      steps: steps.map((s) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        channel: s.channel,
        isActive: s.isActive,
      })),
    });
  } catch (err) {
    next(err);
  }
});
