import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { messages, campaignLeads, contacts, activities } from '../../db/schema.js';
import { analyzeReply } from '../../modules/ai/replyAnalyzer.js';
import { logger } from '../../utils/logger.js';

export async function processReplyJob(job: Job<{ messageId: string }>) {
  const { messageId } = job.data;
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg || msg.direction !== 'inbound') return;

  const analysis = await analyzeReply(msg.bodyText, msg.organizationId);
  logger.info({ messageId, intent: analysis.intent }, 'Reply analyzed');

  await db
    .update(messages)
    .set({
      intentClassification: analysis.intent,
      sentimentScore: analysis.sentiment,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, messageId));

  // Update campaign_lead status based on intent
  if (msg.campaignLeadId) {
    const newStatus =
      analysis.intent === 'meeting_request' || analysis.intent === 'interested'
        ? 'warm'
        : analysis.intent === 'not_interested' || analysis.intent === 'unsubscribe'
          ? 'opted_out'
          : 'replied';

    await db
      .update(campaignLeads)
      .set({
        status: newStatus,
        replyCount: 1,
        updatedAt: new Date(),
      })
      .where(eq(campaignLeads.id, msg.campaignLeadId));
  }

  // Respect unsubscribe
  if (analysis.intent === 'unsubscribe') {
    await db
      .update(contacts)
      .set({ doNotContact: true, updatedAt: new Date() })
      .where(eq(contacts.id, msg.contactId));
  }

  await db.insert(activities).values({
    organizationId: msg.organizationId,
    contactId: msg.contactId,
    activityType: 'email_replied',
    description: `Reply classified as ${analysis.intent}`,
    metadata: analysis,
  });
}
