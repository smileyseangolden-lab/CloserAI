import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { messages, contacts } from '../../db/schema.js';
import { claude } from './anthropic.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface ThreadSnapshot {
  summary?: string;
  recent: Array<{
    id: string;
    direction: string;
    subject: string | null;
    bodyText: string;
    createdAt: Date | null;
  }>;
  totalMessages: number;
}

/**
 * Returns a compact memory of a conversation:
 *   - a running LLM-generated summary of everything except the last N messages
 *   - the last N messages verbatim
 *
 * The summary is cached on the contact row and only regenerated when new
 * messages have arrived since the last summarization.
 */
export async function getThreadSnapshot(contactId: string): Promise<ThreadSnapshot> {
  const threshold = env.THREAD_SUMMARY_THRESHOLD;
  const keepRecent = env.THREAD_SUMMARY_KEEP_RECENT;

  const [{ count }] = (await db.execute<{ count: number }>(
    sql`SELECT COUNT(*)::int AS count FROM messages WHERE contact_id = ${contactId}`,
  )).rows as Array<{ count: number }>;

  const total = Number(count ?? 0);

  const recentRows = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      subject: messages.subject,
      bodyText: messages.bodyText,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.contactId, contactId))
    .orderBy(desc(messages.createdAt))
    .limit(keepRecent);

  const recent = recentRows.reverse();

  if (total <= threshold) {
    return { recent, totalMessages: total };
  }

  const [contact] = await db
    .select({
      conversationSummary: contacts.conversationSummary,
      conversationSummaryLastMessageId: contacts.conversationSummaryLastMessageId,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  // Only rebuild the summary if a new older-than-recent message exists since
  // last summarization. Anything in `recent` stays verbatim.
  const newestOlderThanRecent = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.contactId, contactId))
    .orderBy(desc(messages.createdAt))
    .offset(keepRecent)
    .limit(1);

  const needsRebuild =
    !contact?.conversationSummary ||
    (newestOlderThanRecent[0] &&
      contact.conversationSummaryLastMessageId !== newestOlderThanRecent[0].id);

  if (!needsRebuild) {
    return {
      summary: contact?.conversationSummary ?? undefined,
      recent,
      totalMessages: total,
    };
  }

  const older = await db
    .select({
      direction: messages.direction,
      bodyText: messages.bodyText,
      subject: messages.subject,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.contactId, contactId))
    .orderBy(desc(messages.createdAt))
    .offset(keepRecent)
    .limit(50);

  const transcript = older
    .reverse()
    .map(
      (m) =>
        `[${m.direction}${m.subject ? ` | ${m.subject}` : ''}] ${m.bodyText.slice(0, 800)}`,
    )
    .join('\n');

  const summary = await buildSummary(transcript);

  if (summary && newestOlderThanRecent[0]) {
    await db
      .update(contacts)
      .set({
        conversationSummary: summary,
        conversationSummaryUpdatedAt: new Date(),
        conversationSummaryLastMessageId: newestOlderThanRecent[0].id,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId));
  }

  return { summary: summary ?? undefined, recent, totalMessages: total };
}

async function buildSummary(transcript: string): Promise<string | null> {
  if (!transcript.trim()) return null;
  const prompt = `Summarize this sales conversation transcript for a sales rep who is about to write the next reply.

Focus on: who the prospect is, their role and company, what they've expressed interest or concern about, any objections raised, any commitments made, meeting/demo status, and open questions they want answered.

Keep it under 200 words. Be factual. Do not add recommendations.

Transcript:
"""
${transcript}
"""`;

  try {
    const { text } = await claude(prompt, {
      fast: true,
      maxTokens: 400,
      temperature: 0.2,
    });
    return text.trim();
  } catch (err) {
    logger.warn({ err }, 'Thread summary generation failed');
    return null;
  }
}
