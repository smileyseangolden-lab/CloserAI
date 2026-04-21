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
import { claudeJson } from '../ai/anthropic.js';
import { businessProfiles, valueProps, workspaceStages } from '../../db/schema.js';
import { logger } from '../../utils/logger.js';

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

// ---- PDF upload (base64) --------------------------------------------------

const uploadPdfSchema = z.object({
  filename: z.string().min(1),
  base64: z.string().min(1),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Ingest a PDF. The client base64-encodes the file in a JSON body (capped at
 * the 10MB Express limit), we decode and parse via pdf-parse, then embed each
 * ~4k-char chunk as its own knowledge_base entry.
 */
knowledgeRouter.post('/upload-pdf', validateBody(uploadPdfSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof uploadPdfSchema>;
    const buffer = Buffer.from(body.base64, 'base64');
    if (buffer.length === 0) throw new ValidationError('Empty PDF');

    // Dynamic-import pdf-parse so environments without it fall back cleanly.
    type PdfParseFn = (input: Buffer) => Promise<{ text: string; numpages: number }>;
    let parsePdf: PdfParseFn;
    try {
      const mod = (await import('pdf-parse')) as unknown as
        | { default: PdfParseFn }
        | PdfParseFn;
      parsePdf = (typeof mod === 'function' ? mod : mod.default) as PdfParseFn;
    } catch {
      throw new ValidationError(
        'PDF parser not available on the server. Install pdf-parse.',
      );
    }
    const { text } = await parsePdf(buffer);
    if (!text || text.trim().length < 20) {
      throw new ValidationError('No extractable text in PDF.');
    }

    const baseTitle = body.title ?? body.filename.replace(/\.pdf$/i, '');
    const chunks = chunkText(text, 4000);
    const ids: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const id = await embedAndStoreKnowledgeEntry({
        organizationId: req.auth!.organizationId,
        source: 'document',
        title: chunks.length > 1 ? `${baseTitle} (part ${i + 1})` : baseTitle,
        content: chunks[i]!,
        fileMimeType: 'application/pdf',
        tags: body.tags,
      });
      ids.push(id);
    }
    res.status(201).json({ ids, chunks: ids.length });
  } catch (err) {
    next(err);
  }
});

// ---- Auto-generate battlecards / FAQs / objection playbooks ---------------

const autoGenerateSchema = z.object({
  kinds: z
    .array(z.enum(['battlecard', 'faq', 'objection_playbook']))
    .default(['battlecard', 'faq', 'objection_playbook']),
  count: z.number().int().min(1).max(10).default(3),
});

/**
 * Has Claude draft a batch of knowledge entries (battlecards, FAQs, objection
 * playbooks) grounded in the approved company profile + value props + any
 * previously approved knowledge-stage draft. Each generated entry is embedded
 * and inserted into knowledge_base, so the RAG index lights up immediately.
 */
knowledgeRouter.post(
  '/auto-generate',
  validateBody(autoGenerateSchema),
  async (req, res, next) => {
    try {
      const orgId = req.auth!.organizationId;
      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.organizationId, orgId))
        .limit(1);
      const vps = await db
        .select()
        .from(valueProps)
        .where(eq(valueProps.organizationId, orgId));
      const [knowledgeDraft] = await db
        .select()
        .from(workspaceStages)
        .where(
          and(
            eq(workspaceStages.organizationId, orgId),
            eq(workspaceStages.stageId, 'knowledge'),
          ),
        )
        .limit(1);

      const prompt = `You are generating seed entries for a B2B sales knowledge base.

Context:
Company: ${JSON.stringify(profile ?? {}).slice(0, 1500)}
Value props: ${JSON.stringify(vps).slice(0, 2000)}
Knowledge draft so far: ${JSON.stringify(knowledgeDraft?.data ?? {}).slice(0, 2000)}

For each requested kind below, produce ${req.body.count} specific, non-generic entries grounded in the company's actual differentiators and pain points solved. Each entry must be useful to a rep in a live conversation.

Kinds: ${(req.body.kinds as string[]).join(', ')}

Return JSON:
{
  "battlecard": [{"title": "vs. [Competitor] — how we win", "content": "..."}],
  "faq": [{"title": "Question phrased as a question", "content": "..."}],
  "objection_playbook": [{"title": "Objection in 6-8 words", "content": "Validation → reframe → proof → close"}]
}

Omit any kind not in the requested list. Each "content" field must be 120-250 words, direct, no filler.`;

      type Generated = Record<
        'battlecard' | 'faq' | 'objection_playbook',
        Array<{ title: string; content: string }>
      >;
      let generated: Partial<Generated> = {};
      try {
        generated = await claudeJson<Generated>(prompt, {
          orgId,
          maxTokens: 4096,
          temperature: 0.4,
        });
      } catch (err) {
        logger.warn({ err }, 'auto-generate knowledge failed');
        throw new ValidationError('LLM failed to draft entries. Try again.');
      }

      const created: Array<{ id: string; title: string; kind: string }> = [];
      for (const kind of req.body.kinds as Array<'battlecard' | 'faq' | 'objection_playbook'>) {
        const items = generated[kind] ?? [];
        for (const item of items) {
          if (!item?.title || !item?.content) continue;
          const id = await embedAndStoreKnowledgeEntry({
            organizationId: orgId,
            source: kind,
            title: item.title,
            content: item.content,
            tags: ['auto-generated'],
          });
          created.push({ id, title: item.title, kind });
        }
      }
      res.status(201).json({ created, count: created.length });
    } catch (err) {
      next(err);
    }
  },
);

function chunkText(text: string, size: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size));
  }
  return chunks;
}

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
