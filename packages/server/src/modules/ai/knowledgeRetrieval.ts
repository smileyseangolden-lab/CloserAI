import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { agentKnowledgeBase } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { embed } from './embeddings.js';

export interface RetrievedKnowledge {
  id: string;
  knowledgeType: string;
  title: string;
  content: string;
  similarity: number;
}

export interface RetrieveOptions {
  agentId: string;
  query: string;
  topK?: number;
  minSimilarity?: number;
}

/**
 * Returns the top-K most relevant knowledge base entries for an agent given a
 * natural-language query. Uses pgvector cosine distance via the `<=>` operator.
 */
export async function retrieveRelevantKnowledge(
  opts: RetrieveOptions,
): Promise<RetrievedKnowledge[]> {
  const topK = opts.topK ?? env.RAG_TOP_K;
  const { vector } = await embed(opts.query);
  const vectorLiteral = `[${vector.join(',')}]`;

  try {
    const result = await db.execute<{
      id: string;
      knowledge_type: string;
      title: string;
      content: string;
      similarity: number;
    }>(sql`
      SELECT
        id,
        knowledge_type,
        title,
        content,
        1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM agent_knowledge_base
      WHERE agent_id = ${opts.agentId}
        AND is_active = true
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `);

    const minSim = opts.minSimilarity ?? 0;
    const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows ?? [];
    return (rows as Array<{
      id: string;
      knowledge_type: string;
      title: string;
      content: string;
      similarity: number;
    }>)
      .map((r) => ({
        id: r.id,
        knowledgeType: r.knowledge_type,
        title: r.title,
        content: r.content,
        similarity: Number(r.similarity ?? 0),
      }))
      .filter((r) => r.similarity >= minSim);
  } catch (err) {
    // If pgvector isn't installed yet (e.g. local dev before `npm run db:migrate`),
    // fall back to returning all active entries so message generation still works.
    logger.warn({ err }, 'Vector retrieval failed; falling back to non-vector lookup');
    const fallback = await db
      .select()
      .from(agentKnowledgeBase)
      .where(sql`${agentKnowledgeBase.agentId} = ${opts.agentId} AND ${agentKnowledgeBase.isActive} = true`)
      .limit(topK);
    return fallback.map((r) => ({
      id: r.id,
      knowledgeType: r.knowledgeType,
      title: r.title,
      content: r.content,
      similarity: 0,
    }));
  }
}

/**
 * Embeds a single knowledge entry and stores the vector + model + timestamp.
 */
export async function embedAndStoreKnowledge(id: string, title: string, content: string) {
  const { vector, model } = await embed(`${title}\n\n${content}`);
  await db.execute(sql`
    UPDATE agent_knowledge_base
    SET embedding = ${`[${vector.join(',')}]`}::vector,
        embedding_model = ${model},
        embedded_at = now(),
        updated_at = now()
    WHERE id = ${id}
  `);
}

/**
 * Re-embeds every active knowledge entry for an agent. Used for backfill
 * after import or when switching embedding providers.
 */
export async function backfillAgentEmbeddings(agentId: string): Promise<number> {
  const rows = await db
    .select({
      id: agentKnowledgeBase.id,
      title: agentKnowledgeBase.title,
      content: agentKnowledgeBase.content,
    })
    .from(agentKnowledgeBase)
    .where(sql`${agentKnowledgeBase.agentId} = ${agentId} AND ${agentKnowledgeBase.isActive} = true`);

  let count = 0;
  for (const row of rows) {
    await embedAndStoreKnowledge(row.id, row.title, row.content);
    count++;
  }
  return count;
}
