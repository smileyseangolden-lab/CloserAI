import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { knowledgeBase } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import {
  embedAndStoreKnowledgeEntry,
  searchOrgKnowledge,
} from '../ai/orgKnowledge.js';

export const knowledgeRouter = Router();

const writeSchema = z.object({
  source: z.enum([
    'document',
    'url',
    'pasted',
    'email',
    'battlecard',
    'faq',
    'objection_playbook',
    'website',
    'call_transcript',
  ]),
  title: z.string().min(1),
  content: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  fileMimeType: z.string().optional(),
  brandVoiceTags: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

knowledgeRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: knowledgeBase.id,
        source: knowledgeBase.source,
        title: knowledgeBase.title,
        content: knowledgeBase.content,
        sourceUrl: knowledgeBase.sourceUrl,
        fileMimeType: knowledgeBase.fileMimeType,
        brandVoiceTags: knowledgeBase.brandVoiceTags,
        tags: knowledgeBase.tags,
        embeddingModel: knowledgeBase.embeddingModel,
        embeddedAt: knowledgeBase.embeddedAt,
        isActive: knowledgeBase.isActive,
        createdAt: knowledgeBase.createdAt,
        updatedAt: knowledgeBase.updatedAt,
      })
      .from(knowledgeBase)
      .where(eq(knowledgeBase.organizationId, req.auth!.organizationId))
      .orderBy(desc(knowledgeBase.updatedAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

knowledgeRouter.post('/', validateBody(writeSchema), async (req, res, next) => {
  try {
    const id = await embedAndStoreKnowledgeEntry({
      organizationId: req.auth!.organizationId,
      source: req.body.source,
      title: req.body.title,
      content: req.body.content,
      sourceUrl: req.body.sourceUrl ?? null,
      fileMimeType: req.body.fileMimeType ?? null,
      brandVoiceTags: req.body.brandVoiceTags,
      tags: req.body.tags,
    });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

const ingestUrlSchema = z.object({ url: z.string().url(), title: z.string().optional() });

knowledgeRouter.post(
  '/ingest-url',
  validateBody(ingestUrlSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof ingestUrlSchema>;
      const fetched = await fetch(body.url, {
        headers: { 'User-Agent': 'CloserAIBot/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!fetched.ok) throw new ValidationError(`Fetch failed: ${fetched.status}`);
      const html = await fetched.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20_000);

      const id = await embedAndStoreKnowledgeEntry({
        organizationId: req.auth!.organizationId,
        source: 'url',
        title: body.title ?? body.url,
        content: text,
        sourceUrl: body.url,
      });
      res.status(201).json({ id });
    } catch (err) {
      next(err);
    }
  },
);

knowledgeRouter.patch('/:id', validateBody(writeSchema.partial()), async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.id, req.params.id!),
          eq(knowledgeBase.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!existing) throw new NotFoundError('Knowledge entry');

    const merged = {
      source: (req.body.source ?? existing.source) as z.infer<typeof writeSchema>['source'],
      title: (req.body.title ?? existing.title) as string,
      content: (req.body.content ?? existing.content) as string,
      sourceUrl: (req.body.sourceUrl ?? existing.sourceUrl) as string | null,
      fileMimeType: (req.body.fileMimeType ?? existing.fileMimeType) as string | null,
      brandVoiceTags: req.body.brandVoiceTags ?? existing.brandVoiceTags ?? undefined,
      tags: req.body.tags ?? existing.tags ?? undefined,
    };

    await embedAndStoreKnowledgeEntry({
      id: existing.id,
      organizationId: req.auth!.organizationId,
      ...merged,
    });
    res.json({ id: existing.id });
  } catch (err) {
    next(err);
  }
});

knowledgeRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .delete(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.id, req.params.id!),
          eq(knowledgeBase.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const searchSchema = z.object({ q: z.string().min(1), limit: z.number().int().max(20).optional() });

knowledgeRouter.post('/search', validateBody(searchSchema), async (req, res, next) => {
  try {
    const hits = await searchOrgKnowledge(
      req.auth!.organizationId,
      req.body.q,
      req.body.limit ?? 5,
    );
    res.json(hits);
  } catch (err) {
    next(err);
  }
});
