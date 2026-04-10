import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { messages, contacts, activities, emailAccounts } from '../../db/schema.js';
import { logger } from '../../utils/logger.js';
import { getEmailProvider } from '../../integrations/email/index.js';

interface SendJobData {
  messageId: string;
}

export async function processSendJob(job: Job<SendJobData>) {
  const { messageId } = job.data;
  logger.info({ messageId }, 'Processing send job');

  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg) {
    logger.warn({ messageId }, 'Message not found');
    return;
  }

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, msg.contactId)).limit(1);
  if (!contact) throw new Error(`Contact ${msg.contactId} not found`);
  if (contact.doNotContact) {
    await db
      .update(messages)
      .set({ status: 'failed', errorMessage: 'Contact is marked do_not_contact' })
      .where(eq(messages.id, messageId));
    return;
  }

  await db.update(messages).set({ status: 'sending' }).where(eq(messages.id, messageId));

  try {
    if (msg.channel === 'email') {
      const [account] = await db
        .select()
        .from(emailAccounts)
        .where(eq(emailAccounts.organizationId, msg.organizationId))
        .limit(1);

      const provider = getEmailProvider();
      const result = await provider.send({
        from: account?.emailAddress ?? 'noreply@closerai.local',
        to: contact.email ?? '',
        subject: msg.subject ?? '',
        text: msg.bodyText,
        html: msg.bodyHtml ?? undefined,
      });

      await db
        .update(messages)
        .set({
          status: 'sent',
          externalMessageId: result.messageId,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));

      await db.insert(activities).values({
        organizationId: msg.organizationId,
        contactId: msg.contactId,
        activityType: 'email_sent',
        description: `Email sent: ${msg.subject ?? '(no subject)'}`,
      });
    } else {
      logger.warn({ channel: msg.channel }, 'Channel not yet implemented in send processor');
      await db.update(messages).set({ status: 'sent' }).where(eq(messages.id, messageId));
    }
  } catch (err) {
    logger.error({ err, messageId }, 'Send failed');
    await db
      .update(messages)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'unknown',
      })
      .where(eq(messages.id, messageId));
    throw err;
  }
}
