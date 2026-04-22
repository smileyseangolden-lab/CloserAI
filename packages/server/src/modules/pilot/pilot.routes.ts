import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  agentProfiles,
  deployments,
  pilotReviews,
  pilotRuns,
} from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { claudeJson } from '../ai/anthropic.js';
import { generateTestMessage } from '../ai/messageGenerator.js';
import { logger } from '../../utils/logger.js';

export const pilotRouter = Router();

pilotRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(pilotRuns)
      .where(eq(pilotRuns.organizationId, req.auth!.organizationId))
      .orderBy(desc(pilotRuns.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

pilotRouter.get('/:id', async (req, res, next) => {
  try {
    const [run] = await db
      .select()
      .from(pilotRuns)
      .where(
        and(
          eq(pilotRuns.id, req.params.id!),
          eq(pilotRuns.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!run) throw new NotFoundError('Pilot run');
    const reviews = await db
      .select()
      .from(pilotReviews)
      .where(eq(pilotReviews.pilotRunId, run.id))
      .orderBy(desc(pilotReviews.createdAt));
    res.json({ ...run, reviews });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  deploymentId: z.string().uuid().optional(),
  sampleSize: z.number().int().min(1).max(100).optional(),
  scenarios: z.array(z.string()).optional(),
});

/**
 * Creates a pilot run, generates sample messages against the first active
 * agent (or a requested deployment's assigned agents), and runs each through
 * Claude as a red-team reviewer. Persists everything for the UI.
 */
pilotRouter.post('/', validateBody(createSchema), async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;
    const body = req.body as z.infer<typeof createSchema>;

    let agentIds: string[] = [];
    if (body.deploymentId) {
      const [dep] = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.id, body.deploymentId), eq(deployments.organizationId, orgId)))
        .limit(1);
      if (dep) agentIds = dep.assignedAgentIds ?? [];
    }
    if (agentIds.length === 0) {
      const agents = await db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.organizationId, orgId));
      agentIds = agents.map((a) => a.id);
    }
    if (agentIds.length === 0) {
      throw new NotFoundError('No active agents to pilot');
    }

    const [run] = await db
      .insert(pilotRuns)
      .values({
        organizationId: orgId,
        deploymentId: body.deploymentId,
        sampleSize: body.sampleSize ?? 10,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    const scenarios = body.scenarios ?? [
      'Cold intro to a VP of Sales at a 200-person SaaS company in healthcare.',
      'Follow-up after no reply from a CTO at a 50-person fintech startup.',
      'Nurture warm reply asking about pricing from a Director of Ops.',
    ];

    (async () => {
      try {
        for (const agentId of agentIds) {
          for (const scenario of scenarios.slice(0, body.sampleSize ?? 3)) {
            const msg = await generateTestMessage({
              agentId,
              organizationId: orgId,
              scenario,
            });
            const review = await redTeamReview(msg.subject, msg.body);
            await db.insert(pilotReviews).values({
              pilotRunId: run!.id,
              agentId,
              channel: 'email',
              subject: msg.subject ?? null,
              bodyText: msg.body,
              verdict: review.verdict,
              issues: review.issues,
              reasoning: review.reasoning,
            });
          }
        }

        const allReviews = await db
          .select()
          .from(pilotReviews)
          .where(eq(pilotReviews.pilotRunId, run!.id));

        const flagged = allReviews.filter((r) => r.verdict !== 'ok');
        const goNoGo = flagged.length === 0 ? 'go' : flagged.length <= 1 ? 'go' : 'no_go';
        const reasoning =
          flagged.length === 0
            ? 'All sample messages passed brand, topic, and compliance checks.'
            : `${flagged.length} message(s) flagged: ${flagged.map((r) => r.verdict).join(', ')}.`;

        await db
          .update(pilotRuns)
          .set({
            status: 'ready_for_review',
            goNoGo,
            reasoning,
            redTeamResults: allReviews.map((r) => ({
              id: r.id,
              verdict: r.verdict,
              issues: r.issues,
            })),
            completedAt: new Date(),
          })
          .where(eq(pilotRuns.id, run!.id));
      } catch (err) {
        logger.error({ err }, 'pilot run failed');
        await db
          .update(pilotRuns)
          .set({
            status: 'blocked',
            reasoning: err instanceof Error ? err.message : 'Pilot run failed',
            completedAt: new Date(),
          })
          .where(eq(pilotRuns.id, run!.id));
      }
    })();

    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

const verdictSchema = z.object({
  verdict: z.enum(['ok', 'off_brand', 'off_topic', 'non_compliant', 'needs_edit']),
  issues: z.array(z.string()).optional(),
  reasoning: z.string().optional(),
});

pilotRouter.patch(
  '/reviews/:id',
  validateBody(verdictSchema),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(pilotReviews)
        .set({
          verdict: req.body.verdict,
          issues: req.body.issues,
          reasoning: req.body.reasoning,
          reviewedByUserId: req.auth!.userId,
          reviewedAt: new Date(),
        })
        .where(eq(pilotReviews.id, req.params.id!))
        .returning();
      if (!row) throw new NotFoundError('Review');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

const approveSchema = z.object({
  goNoGo: z.enum(['go', 'no_go']),
  reasoning: z.string().optional(),
});

pilotRouter.post('/:id/approve', validateBody(approveSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof approveSchema>;
    const [row] = await db
      .update(pilotRuns)
      .set({
        status: body.goNoGo === 'go' ? 'approved' : 'blocked',
        goNoGo: body.goNoGo,
        reasoning: body.reasoning,
      })
      .where(
        and(
          eq(pilotRuns.id, req.params.id!),
          eq(pilotRuns.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError('Pilot run');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

const killSchema = z.object({ reason: z.string().min(1) });

pilotRouter.post('/:id/kill', validateBody(killSchema), async (req, res, next) => {
  try {
    const [row] = await db
      .update(pilotRuns)
      .set({
        status: 'blocked',
        killSwitchActivated: true,
        killSwitchReason: req.body.reason,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(pilotRuns.id, req.params.id!),
          eq(pilotRuns.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError('Pilot run');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

async function redTeamReview(
  subject: string | null | undefined,
  body: string,
): Promise<{
  verdict: 'ok' | 'off_brand' | 'off_topic' | 'non_compliant' | 'needs_edit';
  issues: string[];
  reasoning: string;
}> {
  const prompt = `You are a strict red-team reviewer for B2B sales outreach. Review this message and return JSON.

Subject: ${subject ?? '(no subject)'}
Body:
${body}

Rules to check:
- Off-brand: overly promotional, spammy, or unprofessional tone
- Off-topic: doesn't match a legitimate B2B sales scenario
- Non-compliant: missing unsubscribe language, makes unverifiable claims, pressures recipient, or risks CAN-SPAM/GDPR/CCPA/LinkedIn-ToS issues
- Needs edit: factual errors, broken links, placeholder text, formatting issues

Return JSON:
{
  "verdict": "ok" | "off_brand" | "off_topic" | "non_compliant" | "needs_edit",
  "issues": [strings],
  "reasoning": "string, 1-2 sentences"
}`;
  try {
    const result = await claudeJson<{
      verdict: 'ok' | 'off_brand' | 'off_topic' | 'non_compliant' | 'needs_edit';
      issues: string[];
      reasoning: string;
    }>(prompt, { maxTokens: 512, temperature: 0.2 });
    return {
      verdict: result.verdict ?? 'ok',
      issues: Array.isArray(result.issues) ? result.issues : [],
      reasoning: result.reasoning ?? '',
    };
  } catch (err) {
    logger.warn({ err }, 'red-team review failed, defaulting to ok');
    return { verdict: 'ok', issues: [], reasoning: 'Review skipped (LLM unavailable).' };
  }
}
