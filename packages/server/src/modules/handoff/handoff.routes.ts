import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { escalationPaths, handoffRules } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { claudeJson } from '../ai/anthropic.js';

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
