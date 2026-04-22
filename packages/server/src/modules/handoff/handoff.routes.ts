import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  activities,
  businessProfiles,
  contacts,
  escalationPaths,
  handoffRules,
  leads,
  messages,
  opportunities,
} from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { claude, claudeJson } from '../ai/anthropic.js';

export const handoffRouter = Router();

// ---- handoff_rules --------------------------------------------------------

const ruleSchema = z.object({
  name: z.string().min(1),
  naturalLanguageRule: z.string().min(1),
  triggerConfig: z.record(z.unknown()).optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

handoffRouter.get('/rules', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(handoffRules)
      .where(eq(handoffRules.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

handoffRouter.post('/rules', validateBody(ruleSchema), async (req, res, next) => {
  try {
    const [row] = await db
      .insert(handoffRules)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

handoffRouter.patch(
  '/rules/:id',
  validateBody(ruleSchema.partial()),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(handoffRules)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(handoffRules.id, req.params.id!),
            eq(handoffRules.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Handoff rule');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

handoffRouter.delete('/rules/:id', async (req, res, next) => {
  try {
    await db
      .delete(handoffRules)
      .where(
        and(
          eq(handoffRules.id, req.params.id!),
          eq(handoffRules.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * Translate plain-English handoff criteria into a machine-readable trigger
 * config the runtime can evaluate against opportunities/leads.
 */
const compileSchema = z.object({ naturalLanguageRule: z.string().min(1) });

handoffRouter.post('/rules/compile', validateBody(compileSchema), async (req, res, next) => {
  try {
    const prompt = `Translate this natural-language sales-handoff rule into a JSON trigger config the system can evaluate.

Rule: "${req.body.naturalLanguageRule}"

Return JSON:
{
  "summary": "short label",
  "conditions": [
    { "field": "opportunity.estimated_value", "op": ">=", "value": 50000 },
    { "field": "lead.companySize", "op": "in", "value": ["201-500","501-1000"] }
  ],
  "logic": "all" | "any"
}

Allowed fields: lead.status, lead.leadScore, lead.companySize, lead.companyIndustry,
contact.seniorityLevel, contact.jobTitle, opportunity.stage, opportunity.estimated_value,
opportunity.probability, campaign_lead.replyCount.

Allowed ops: "=", "!=", ">", ">=", "<", "<=", "in", "not_in", "contains".`;
    const compiled = await claudeJson<Record<string, unknown>>(prompt, {
      maxTokens: 512,
      temperature: 0.1,
    });
    res.json(compiled);
  } catch (err) {
    next(err);
  }
});

// ---- escalation_paths -----------------------------------------------------

const pathSchema = z.object({
  handoffRuleId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  role: z.enum(['am', 'ae', 'sales_lead', 'success', 'support', 'custom']).optional(),
  slaMinutes: z.number().int().min(1).optional(),
  contextPacketTemplate: z.string().optional(),
  notificationChannels: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

handoffRouter.get('/paths', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(escalationPaths)
      .where(eq(escalationPaths.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

handoffRouter.post('/paths', validateBody(pathSchema), async (req, res, next) => {
  try {
    const [row] = await db
      .insert(escalationPaths)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

handoffRouter.patch(
  '/paths/:id',
  validateBody(pathSchema.partial()),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(escalationPaths)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(escalationPaths.id, req.params.id!),
            eq(escalationPaths.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Escalation path');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

handoffRouter.delete('/paths/:id', async (req, res, next) => {
  try {
    await db
      .delete(escalationPaths)
      .where(
        and(
          eq(escalationPaths.id, req.params.id!),
          eq(escalationPaths.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- context packet generator ---------------------------------------------

const packetSchema = z.object({
  opportunityId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  ruleId: z.string().uuid().optional(),
});

/**
 * Assemble a rep-ready context packet for a handoff. Pulls opportunity / lead
 * / contact / recent-messages / recent-activities, then has Claude render the
 * handoff_rules.contextPacketTemplate (if any) against that data into a
 * single markdown brief the rep can read in under a minute.
 */
handoffRouter.post(
  '/context-packet',
  validateBody(packetSchema),
  async (req, res, next) => {
    try {
      const orgId = req.auth!.organizationId;
      const body = req.body as z.infer<typeof packetSchema>;
      if (!body.opportunityId && !body.leadId) {
        throw new ValidationError('Provide opportunityId or leadId');
      }

      let opp = null;
      let lead = null;
      let contact = null;

      if (body.opportunityId) {
        [opp] = await db
          .select()
          .from(opportunities)
          .where(
            and(eq(opportunities.id, body.opportunityId), eq(opportunities.organizationId, orgId)),
          )
          .limit(1);
        if (opp) {
          [lead] = await db
            .select()
            .from(leads)
            .where(eq(leads.id, opp.leadId))
            .limit(1);
          [contact] = await db
            .select()
            .from(contacts)
            .where(eq(contacts.id, opp.contactId))
            .limit(1);
        }
      }
      if (!lead && body.leadId) {
        [lead] = await db
          .select()
          .from(leads)
          .where(and(eq(leads.id, body.leadId), eq(leads.organizationId, orgId)))
          .limit(1);
      }
      if (!contact && body.contactId) {
        [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, body.contactId), eq(contacts.organizationId, orgId)))
          .limit(1);
      }

      if (!lead) throw new NotFoundError('Lead');

      const recentMessages = contact
        ? await db
            .select()
            .from(messages)
            .where(
              and(eq(messages.organizationId, orgId), eq(messages.contactId, contact.id)),
            )
            .orderBy(desc(messages.createdAt))
            .limit(20)
        : [];

      const recentActivities = await db
        .select()
        .from(activities)
        .where(and(eq(activities.organizationId, orgId), eq(activities.leadId, lead.id)))
        .orderBy(desc(activities.createdAt))
        .limit(20);

      let rule = null;
      if (body.ruleId) {
        [rule] = await db
          .select()
          .from(handoffRules)
          .where(and(eq(handoffRules.id, body.ruleId), eq(handoffRules.organizationId, orgId)))
          .limit(1);
      }

      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.organizationId, orgId))
        .limit(1);

      const template =
        rule?.triggerConfig && typeof rule.triggerConfig === 'object'
          ? (rule.triggerConfig as { contextPacketTemplate?: string }).contextPacketTemplate
          : null;

      const prompt = `You write rep-ready sales handoff packets. Produce a concise markdown brief a rep can absorb in 60 seconds. Include (in this order):
  1. TL;DR (2 sentences)
  2. Key facts (bullets: company, stage, value, timeline)
  3. Decision-maker snapshot
  4. Engagement history (what's been said, what worked)
  5. Open questions / risks
  6. Suggested next step

Company context: ${JSON.stringify(profile ?? {}).slice(0, 1500)}
Handoff rule: ${rule ? rule.naturalLanguageRule : '(generic)'}
${template ? `Custom template instructions: ${template}` : ''}

Opportunity: ${JSON.stringify(opp ?? null).slice(0, 1500)}
Lead: ${JSON.stringify(lead).slice(0, 1500)}
Contact: ${JSON.stringify(contact ?? null).slice(0, 1500)}

Recent messages (newest first):
${recentMessages
  .map(
    (m, i) =>
      `${i + 1}. [${m.direction}/${m.channel}] ${m.subject ? `(${m.subject}) ` : ''}${m.bodyText.slice(0, 400)}`,
  )
  .join('\n')}

Recent activities:
${recentActivities.map((a) => `- ${a.activityType}: ${a.description ?? ''}`).join('\n')}

Output just the markdown — no preamble.`;

      const { text } = await claude(prompt, { orgId, maxTokens: 1500, temperature: 0.3 });
      res.json({
        packet: text,
        context: {
          opportunityId: opp?.id ?? null,
          leadId: lead.id,
          contactId: contact?.id ?? null,
          ruleId: rule?.id ?? null,
        },
      });
      void claudeJson; // reserved for future structured-packet variants
    } catch (err) {
      next(err);
    }
  },
);
