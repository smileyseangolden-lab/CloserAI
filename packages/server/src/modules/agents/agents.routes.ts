import { Router } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { agentProfiles, agentKnowledgeBase } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { generateTestMessage } from '../ai/messageGenerator.js';
import {
  backfillAgentEmbeddings,
  embedAndStoreKnowledge,
} from '../ai/knowledgeRetrieval.js';
import { logger } from '../../utils/logger.js';
import { AGENT_CATALOG, recommendSquad } from './agentCatalog.js';

export const agentsRouter = Router();

// ---- Catalog routes (20-agent squad) --------------------------------------

agentsRouter.get('/catalog', (_req, res) => {
  res.json(
    AGENT_CATALOG.map((a) => ({
      key: a.key,
      name: a.name,
      category: a.category,
      agentType: a.agentType,
      personalityStyle: a.personalityStyle,
      channels: a.channels,
      description: a.description,
      motions: a.motions,
    })),
  );
});

agentsRouter.get('/catalog/squad', (req, res) => {
  const motion = (req.query.motion as string) || 'outbound_heavy';
  const valid = ['outbound_heavy', 'inbound_heavy', 'partner_driven', 'plg'] as const;
  type Motion = (typeof valid)[number];
  if (!(valid as readonly string[]).includes(motion)) {
    return res.status(422).json({ error: { message: 'Invalid motion' } });
  }
  res.json({ motion, keys: recommendSquad(motion as Motion) });
});

/**
 * Activate an agent from the catalog: upsert an agent_profiles row using the
 * catalog blueprint (or merge user overrides on top). Idempotent — repeated
 * activation updates the existing row.
 */
agentsRouter.post('/catalog/:key/activate', async (req, res, next) => {
  try {
    const blueprint = AGENT_CATALOG.find((a) => a.key === req.params.key);
    if (!blueprint) throw new NotFoundError('Catalog agent');
    const orgId = req.auth!.organizationId;
    const overrides = (req.body ?? {}) as Record<string, unknown>;

    const values = {
      organizationId: orgId,
      name: (overrides.name as string) ?? blueprint.name,
      agentType: blueprint.agentType,
      personalityStyle: blueprint.personalityStyle,
      toneDescription: (overrides.toneDescription as string) ?? blueprint.description,
      systemPromptOverride: (overrides.systemPromptOverride as string) ?? blueprint.systemPrompt,
      senderName: (overrides.senderName as string) ?? blueprint.name,
      senderTitle: (overrides.senderTitle as string) ?? null,
      isActive: (overrides.isActive as boolean) ?? true,
    };

    const [existing] = await db
      .select()
      .from(agentProfiles)
      .where(and(eq(agentProfiles.organizationId, orgId), eq(agentProfiles.name, values.name)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(agentProfiles)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(agentProfiles.id, existing.id))
        .returning();
      return res.json({ ...updated, catalogKey: blueprint.key });
    }

    const [created] = await db.insert(agentProfiles).values(values).returning();
    res.status(201).json({ ...created, catalogKey: blueprint.key });
  } catch (err) {
    next(err);
  }
});

const agentSchema = z.object({
  name: z.string().min(1),
  agentType: z.enum(['prospector', 'nurturer', 'closer', 'hybrid']),
  personalityStyle: z.enum([
    'technical',
    'consultative',
    'social_friendly',
    'executive',
    'challenger',
    'educational',
  ]),
  toneDescription: z.string().optional(),
  writingStyleExamples: z.array(z.string()).optional(),
  systemPromptOverride: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  senderName: z.string().min(1),
  senderTitle: z.string().optional(),
  emailSignature: z.string().optional(),
  linkedinBio: z.string().optional(),
  responseSpeed: z.enum(['instant', 'fast_1hr', 'moderate_4hr', 'slow_24hr']).optional(),
  workingHoursStart: z.string().optional(),
  workingHoursEnd: z.string().optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).optional(),
  maxDailyOutreach: z.number().int().min(1).max(1000).optional(),
  maxConcurrentConversations: z.number().int().min(1).max(5000).optional(),
  escalationRules: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

agentsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.organizationId, req.auth!.organizationId),
          isNull(agentProfiles.deletedAt),
        ),
      );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

agentsRouter.post('/', validateBody(agentSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(agentProfiles)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

agentsRouter.get('/:id', async (req, res, next) => {
  try {
    const [agent] = await db
      .select()
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.id, req.params.id!),
          eq(agentProfiles.organizationId, req.auth!.organizationId),
          isNull(agentProfiles.deletedAt),
        ),
      )
      .limit(1);
    if (!agent) throw new NotFoundError('Agent');

    const knowledge = await db
      .select()
      .from(agentKnowledgeBase)
      .where(eq(agentKnowledgeBase.agentId, agent.id));

    res.json({ ...agent, knowledge });
  } catch (err) {
    next(err);
  }
});

agentsRouter.patch('/:id', validateBody(agentSchema.partial()), async (req, res, next) => {
  try {
    const [updated] = await db
      .update(agentProfiles)
      .set({ ...req.body, updatedAt: new Date() })
      .where(
        and(
          eq(agentProfiles.id, req.params.id!),
          eq(agentProfiles.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundError('Agent');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

agentsRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .update(agentProfiles)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(agentProfiles.id, req.params.id!),
          eq(agentProfiles.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- Knowledge base ----
const knowledgeSchema = z.object({
  knowledgeType: z.enum([
    'product_info',
    'objection_handling',
    'competitor_intel',
    'pricing',
    'case_study',
    'faq',
    'custom',
  ]),
  title: z.string().min(1),
  content: z.string().min(1),
  isActive: z.boolean().optional(),
});

agentsRouter.post('/:id/knowledge', validateBody(knowledgeSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(agentKnowledgeBase)
      .values({ ...req.body, agentId: req.params.id! })
      .returning();
    if (created) {
      embedAndStoreKnowledge(
        created.id,
        created.title,
        created.content,
        req.auth!.organizationId,
      ).catch((err) => {
        logger.error({ err, id: created.id }, 'Failed to embed knowledge entry');
      });
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

agentsRouter.patch(
  '/:id/knowledge/:knowledgeId',
  validateBody(knowledgeSchema.partial()),
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(agentKnowledgeBase)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(agentKnowledgeBase.id, req.params.knowledgeId!),
            eq(agentKnowledgeBase.agentId, req.params.id!),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundError('Knowledge entry');
      if (req.body.title !== undefined || req.body.content !== undefined) {
        embedAndStoreKnowledge(
          updated.id,
          updated.title,
          updated.content,
          req.auth!.organizationId,
        ).catch((err) => {
          logger.error({ err, id: updated.id }, 'Failed to re-embed knowledge entry');
        });
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

agentsRouter.delete('/:id/knowledge/:knowledgeId', async (req, res, next) => {
  try {
    await db
      .delete(agentKnowledgeBase)
      .where(
        and(
          eq(agentKnowledgeBase.id, req.params.knowledgeId!),
          eq(agentKnowledgeBase.agentId, req.params.id!),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

agentsRouter.post('/:id/knowledge/backfill', async (req, res, next) => {
  try {
    const count = await backfillAgentEmbeddings(req.params.id!, req.auth!.organizationId);
    res.json({ embedded: count });
  } catch (err) {
    next(err);
  }
});

// ---- Test message generation ----
const testMessageSchema = z.object({
  leadId: z.string().uuid().optional(),
  scenario: z.string().min(1),
});

agentsRouter.post('/:id/test-message', validateBody(testMessageSchema), async (req, res, next) => {
  try {
    const message = await generateTestMessage({
      agentId: req.params.id!,
      organizationId: req.auth!.organizationId,
      leadId: req.body.leadId,
      scenario: req.body.scenario,
    });
    res.json(message);
  } catch (err) {
    next(err);
  }
});
