import crypto from 'node:crypto';
import type { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { messages, contacts, activities, emailAccounts } from '../../db/schema.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { getEmailProvider } from '../../integrations/email/index.js';
import { getLinkedInProvider } from '../../integrations/linkedin/index.js';

interface SendJobData {
  messageId: string;
}

function buildMessageId(contactId: string): string {
  // Deterministic-enough Message-ID: per-send random + domain. Inbound webhooks
  // will match replies back via externalMessageId.
  const random = crypto.randomBytes(8).toString('hex');
  return `closerai-${contactId}-${random}@${env.OUTBOUND_MESSAGE_ID_DOMAIN}`;
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

      // Reuse an existing Message-ID on retries; otherwise mint one so the
      // inbound webhook can stitch replies back to this outbound message.
      const stampedMessageId = msg.externalMessageId ?? buildMessageId(msg.contactId);

      // Thread ID is stable per campaign_lead when we have one, else per contact.
      // Inbound ingest will fall back to the raw Message-ID if this is missing.
      const threadId = msg.threadId ?? (msg.campaignLeadId
        ? `thread-cl-${msg.campaignLeadId}@${env.OUTBOUND_MESSAGE_ID_DOMAIN}`
        : `thread-c-${msg.contactId}@${env.OUTBOUND_MESSAGE_ID_DOMAIN}`);

      // If we're replying to a known inbound, thread it with In-Reply-To +
      // References so email clients group it correctly.
      const priorInbound = await db
        .select({ externalMessageId: messages.externalMessageId })
        .from(messages)
        .where(eq(messages.contactId, msg.contactId))
        .orderBy(sql`created_at DESC`)
        .limit(10);
      const lastInboundId = priorInbound
        .map((m) => m.externalMessageId)
        .find((id): id is string => !!id);

      const headers: Record<string, string> = {
        'Message-ID': `<${stampedMessageId}>`,
      };
      if (lastInboundId) {
        headers['In-Reply-To'] = `<${lastInboundId}>`;
        headers['References'] = `<${lastInboundId}>`;
      }

      const provider = await getEmailProvider(msg.organizationId);
      const result = await provider.send({
        from: account?.emailAddress ?? `noreply@${env.OUTBOUND_MESSAGE_ID_DOMAIN}`,
        to: contact.email ?? '',
        subject: msg.subject ?? '',
        text: msg.bodyText,
        html: msg.bodyHtml ?? undefined,
        headers,
      });

      await db
        .update(messages)
        .set({
          status: 'sent',
          // Prefer the Message-ID we stamped (stable) over whatever the provider
          // returns (often the same, but some providers rewrite it on send).
          externalMessageId: stampedMessageId,
          threadId,
          metadata: { providerMessageId: result.messageId },
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));

      await db.insert(activities).values({
        organizationId: msg.organizationId,
        contactId: msg.contactId,
        activityType: 'email_sent',
        description: `Email sent: ${msg.subject ?? '(no subject)'}`,
      });
    } else if (msg.channel === 'linkedin') {
      if (!contact.linkedinUrl) {
        await db
          .update(messages)
          .set({ status: 'failed', errorMessage: 'Contact has no LinkedIn URL' })
          .where(eq(messages.id, messageId));
        return;
      }

      // Connection request vs direct message is selected via metadata.linkedinAction.
      // Default is 'message'; first-touch campaign steps should set 'connection'.
      const action =
        (msg.metadata as { linkedinAction?: string } | null)?.linkedinAction === 'connection'
          ? 'connection'
          : 'message';

      const linkedin = await getLinkedInProvider(msg.organizationId);
      if (linkedin.accountStatus) {
        const status = await linkedin.accountStatus();
        if (!status.connected) {
          await db
            .update(messages)
            .set({
              status: 'failed',
              errorMessage: `LinkedIn account not connected: ${status.warnings?.join(', ') ?? 'unknown'}`,
            })
            .where(eq(messages.id, messageId));
          throw new Error('LinkedIn account not connected');
        }
      }

      const profile = {
        profileUrl: contact.linkedinUrl,
        firstName: contact.firstName ?? undefined,
        lastName: contact.lastName ?? undefined,
      };

      const result =
        action === 'connection'
          ? await linkedin.sendConnectionRequest(profile, msg.bodyText)
          : await linkedin.sendMessage(profile, msg.bodyText);

      if (!result.success) {
        await db
          .update(messages)
          .set({
            status: result.rateLimited ? 'queued' : 'failed',
            errorMessage: result.reason ?? 'LinkedIn send failed',
          })
          .where(eq(messages.id, messageId));
        if (result.rateLimited) {
          throw new Error('LinkedIn rate limited');
        }
        return;
      }

      await db
        .update(messages)
        .set({
          status: 'sent',
          externalMessageId: result.externalId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));

      await db.insert(activities).values({
        organizationId: msg.organizationId,
        contactId: msg.contactId,
        activityType:
          action === 'connection' ? 'linkedin_connection_sent' : 'linkedin_message_sent',
        description:
          action === 'connection'
            ? `LinkedIn connection request sent`
            : `LinkedIn message sent`,
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
