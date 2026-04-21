/**
 * Org-wide knowledge_base ingestion + RAG retrieval (Stage 6).
 *
 * Unlike agent_knowledge_base (per-agent snippets), knowledge_base is a single
 * corpus shared by every assistant, every agent, and every downstream runtime.
 * Entries are embedded on write and searched via pgvector cosine similarity.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { knowledgeBase } from '../../db/schema.js';
import { embed } from './embeddings.js';
import { logger } from '../../utils/logger.js';

type KnowledgeSource =
  | 'document'
  | 'url'
  | 'pasted'
  | 'email'
  | 'battlecard'
  | 'faq'
  | 'objection_playbook'
  | 'website'
  | 'call_transcript';

export interface EmbedAndStoreArgs {
  organizationId: string;
  source: KnowledgeSource;
  title: string;
  content: string;
  sourceUrl?: string | null;
  fileMimeType?: string | null;
  brandVoiceTags?: string[];
  tags?: string[];
  /** When supplied, updates an existing row instead of inserting a new one. */
  id?: string;
}

export async function embedAndStoreKnowledgeEntry(args: EmbedAndStoreArgs): Promise<string> {
  const textForEmbedding = `${args.title}\n\n${args.content}`.slice(0, 8000);
  let embedding: number[] | null = null;
  let embeddingModel: string | null = null;

  try {
    const res = await embed(textForEmbedding, args.organizationId);
    embedding = res.vector;
    embeddingModel = res.model;
  } catch (err) {
    logger.warn({ err }, 'knowledge_base embedding failed — storing without vector');
  }

  if (args.id) {
    const [updated] = await db
      .update(knowledgeBase)
      .set({
        source: args.source,
        title: args.title,
        content: args.content,
        sourceUrl: args.sourceUrl ?? null,
        fileMimeType: args.fileMimeType ?? null,
        brandVoiceTags: args.brandVoiceTags,
        tags: args.tags,
        embedding: embedding ?? undefined,
        embeddingModel: embeddingModel ?? undefined,
        embeddedAt: embedding ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(eq(knowledgeBase.id, args.id), eq(knowledgeBase.organizationId, args.organizationId)),
      )
      .returning({ id: knowledgeBase.id });
    if (updated) return updated.id;
  }

  const [created] = await db
    .insert(knowledgeBase)
    .values({
      organizationId: args.organizationId,
      source: args.source,
      title: args.title,
      content: args.content,
      sourceUrl: args.sourceUrl ?? null,
      fileMimeType: args.fileMimeType ?? null,
      brandVoiceTags: args.brandVoiceTags,
      tags: args.tags,
      embedding: embedding ?? undefined,
      embeddingModel: embeddingModel ?? undefined,
      embeddedAt: embedding ? new Date() : undefined,
    })
    .returning({ id: knowledgeBase.id });

  return created!.id;
}

export interface KnowledgeSearchResult {
  id: string;
  source: string;
  title: string;
  content: string;
  similarity: number | null;
}

export async function searchOrgKnowledge(
  organizationId: string,
  query: string,
  limit = 5,
): Promise<KnowledgeSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  let queryVec: number[] | null = null;
  try {
    const res = await embed(clean, organizationId);
    queryVec = res.vector;
  } catch (err) {
    logger.warn({ err }, 'knowledge query embedding failed — falling back to recency');
  }

  if (!queryVec) {
    const rows = await db
      .select({
        id: knowledgeBase.id,
        source: knowledgeBase.source,
        title: knowledgeBase.title,
        content: knowledgeBase.content,
      })
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.organizationId, organizationId),
          eq(knowledgeBase.isActive, true),
        ),
      )
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, similarity: null }));
  }

  const vecLiteral = `[${queryVec.join(',')}]`;
  const rows = await db
    .select({
      id: knowledgeBase.id,
      source: knowledgeBase.source,
      title: knowledgeBase.title,
      content: knowledgeBase.content,
      similarity: sql<number>`1 - (${knowledgeBase.embedding} <=> ${vecLiteral}::vector)`,
    })
    .from(knowledgeBase)
    .where(
      and(
        eq(knowledgeBase.organizationId, organizationId),
        eq(knowledgeBase.isActive, true),
        sql`${knowledgeBase.embedding} is not null`,
      ),
    )
    .orderBy(sql`${knowledgeBase.embedding} <=> ${vecLiteral}::vector`)
    .limit(limit);

  return rows.map((r) => ({ ...r, similarity: Number(r.similarity ?? 0) }));
}
