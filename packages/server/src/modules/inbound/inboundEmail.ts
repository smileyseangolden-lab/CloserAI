import { and, eq, sql } from 'drizzle-orm';
import { simpleParser } from 'mailparser';
import { db } from '../../db/index.js';
import { messages, contacts, emailAccounts, activities } from '../../db/schema.js';
import { replyQueue } from '../../jobs/queue.js';
import { logger } from '../../utils/logger.js';

/**
 * Normalized shape that every provider payload collapses to.
 * All IDs here are RFC 5322 Message-IDs with angle brackets stripped.
 */
export interface NormalizedInbound {
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  receivedAt: Date;
  headers?: Record<string, string>;
}

export type InboundProvider = 'postmark' | 'sendgrid' | 'mailgun' | 'generic' | 'mime';

export interface IngestResult {
  status: 'ingested' | 'duplicate' | 'unmatched' | 'error';
  messageId?: string;
  contactId?: string;
  threadId?: string;
  reason?: string;
}

// ---------- Normalization ----------

/** Strips angle brackets and whitespace from a Message-ID. */
export function normalizeMessageId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^<+|>+$/g, '').trim() || undefined;
}

/** Parses the `References` header into a list of Message-IDs. */
export function parseReferences(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((id) => normalizeMessageId(id))
    .filter((id): id is string => !!id);
}

/** Extracts an email address from a "Name <user@host>" string. */
export function extractEmail(raw?: string | null): { email: string; name?: string } {
  if (!raw) return { email: '' };
  const trimmed = raw.trim();
  const angle = trimmed.match(/^(.*?)<([^>]+)>\s*$/);
  if (angle) {
    const name = angle[1]?.trim().replace(/^"+|"+$/g, '') || undefined;
    return { email: (angle[2] ?? '').trim().toLowerCase(), name };
  }
  return { email: trimmed.toLowerCase() };
}

// ---------- Provider payload parsers ----------

export function parsePostmarkPayload(payload: Record<string, unknown>): NormalizedInbound {
  const headers = Array.isArray(payload.Headers)
    ? Object.fromEntries(
        (payload.Headers as Array<{ Name: string; Value: string }>).map((h) => [
          h.Name.toLowerCase(),
          h.Value,
        ]),
      )
    : {};
  const from = extractEmail(payload.From as string);
  const toList = Array.isArray(payload.ToFull)
    ? (payload.ToFull as Array<{ Email: string }>).map((t) => t.Email.toLowerCase())
    : [(payload.To as string | undefined)?.toLowerCase() ?? ''].filter(Boolean);

  return {
    fromEmail: from.email,
    fromName: from.name,
    toEmails: toList,
    subject: (payload.Subject as string) ?? '',
    textBody: (payload.TextBody as string) ?? '',
    htmlBody: (payload.HtmlBody as string) ?? undefined,
    messageId: normalizeMessageId((payload.MessageID as string) ?? headers['message-id']),
    inReplyTo: normalizeMessageId(headers['in-reply-to']),
    references: parseReferences(headers['references']),
    receivedAt: payload.Date ? new Date(payload.Date as string) : new Date(),
    headers,
  };
}

export function parseSendGridPayload(payload: Record<string, unknown>): NormalizedInbound {
  // SendGrid inbound parse posts `headers` as a single string block.
  const rawHeaders = (payload.headers as string) ?? '';
  const headers: Record<string, string> = {};
  for (const line of rawHeaders.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  const from = extractEmail(payload.from as string);
  const to = (payload.to as string) ?? headers['to'] ?? '';
  return {
    fromEmail: from.email,
    fromName: from.name,
    toEmails: to
      .split(',')
      .map((x) => extractEmail(x).email)
      .filter(Boolean),
    subject: (payload.subject as string) ?? '',
    textBody: (payload.text as string) ?? '',
    htmlBody: (payload.html as string) ?? undefined,
    messageId: normalizeMessageId(headers['message-id']),
    inReplyTo: normalizeMessageId(headers['in-reply-to']),
    references: parseReferences(headers['references']),
    receivedAt: new Date(),
    headers,
  };
}

export function parseGenericPayload(payload: Record<string, unknown>): NormalizedInbound {
  const from = extractEmail((payload.from as string) ?? '');
  const to = (payload.to as string | string[] | undefined) ?? [];
  const toList = Array.isArray(to) ? to : [to];
  return {
    fromEmail: from.email,
    fromName: from.name,
    toEmails: toList.map((t) => extractEmail(t).email).filter(Boolean),
    subject: (payload.subject as string) ?? '',
    textBody: (payload.text as string) ?? (payload.body as string) ?? '',
    htmlBody: (payload.html as string) ?? undefined,
    messageId: normalizeMessageId(payload.messageId as string),
    inReplyTo: normalizeMessageId(payload.inReplyTo as string),
    references: parseReferences(payload.references as string),
    receivedAt: payload.receivedAt ? new Date(payload.receivedAt as string) : new Date(),
  };
}

export async function parseMimePayload(raw: string | Buffer): Promise<NormalizedInbound> {
  const parsed = await simpleParser(raw);
  const from = parsed.from?.value?.[0];
  const toAddrs = Array.isArray(parsed.to)
    ? parsed.to.flatMap((t) => t.value)
    : parsed.to?.value ?? [];
  return {
    fromEmail: (from?.address ?? '').toLowerCase(),
    fromName: from?.name || undefined,
    toEmails: toAddrs.map((a) => (a.address ?? '').toLowerCase()).filter(Boolean),
    subject: parsed.subject ?? '',
    textBody: parsed.text ?? '',
    htmlBody: typeof parsed.html === 'string' ? parsed.html : undefined,
    messageId: normalizeMessageId(parsed.messageId),
    inReplyTo: normalizeMessageId(parsed.inReplyTo ?? undefined),
    references: Array.isArray(parsed.references)
      ? parsed.references.map((r) => normalizeMessageId(r)).filter((r): r is string => !!r)
      : parseReferences(typeof parsed.references === 'string' ? parsed.references : undefined),
    receivedAt: parsed.date ?? new Date(),
  };
}

// ---------- Thread matching ----------

interface ThreadMatch {
  organizationId: string;
  contactId: string;
  campaignLeadId?: string | null;
  agentId?: string | null;
  threadId?: string | null;
  matchedOn: 'message_id' | 'contact_email' | 'to_address';
}

/**
 * Finds the conversation this inbound email belongs to. Priority:
 *   1. The Message-IDs in In-Reply-To / References match an outbound we sent.
 *   2. The From address matches a known contact (best-effort scope by To address).
 *   3. The To address matches an email_accounts row to find the org, and the
 *      contact is auto-resolved from the From address if unique.
 */
export async function matchThread(inbound: NormalizedInbound): Promise<ThreadMatch | null> {
  const candidateIds = [
    ...(inbound.inReplyTo ? [inbound.inReplyTo] : []),
    ...inbound.references,
  ];
  if (candidateIds.length > 0) {
    const rows = await db
      .select({
        id: messages.id,
        organizationId: messages.organizationId,
        contactId: messages.contactId,
        campaignLeadId: messages.campaignLeadId,
        agentId: messages.agentId,
        threadId: messages.threadId,
      })
      .from(messages)
      .where(
        and(
          sql`${messages.direction} = 'outbound'`,
          sql`${messages.externalMessageId} = ANY(${candidateIds})`,
        ),
      )
      .limit(1);
    if (rows[0]) {
      return {
        organizationId: rows[0].organizationId,
        contactId: rows[0].contactId,
        campaignLeadId: rows[0].campaignLeadId,
        agentId: rows[0].agentId,
        threadId: rows[0].threadId,
        matchedOn: 'message_id',
      };
    }
  }

  if (inbound.fromEmail) {
    const contactRows = await db
      .select({
        id: contacts.id,
        organizationId: contacts.organizationId,
      })
      .from(contacts)
      .where(sql`lower(${contacts.email}) = ${inbound.fromEmail}`)
      .limit(5);

    if (contactRows.length === 1) {
      return {
        organizationId: contactRows[0]!.organizationId,
        contactId: contactRows[0]!.id,
        matchedOn: 'contact_email',
      };
    }

    if (contactRows.length > 1 && inbound.toEmails.length > 0) {
      const accounts = await db
        .select({ organizationId: emailAccounts.organizationId })
        .from(emailAccounts)
        .where(sql`lower(${emailAccounts.emailAddress}) = ANY(${inbound.toEmails})`)
        .limit(1);
      const org = accounts[0]?.organizationId;
      if (org) {
        const disambiguated = contactRows.find((c) => c.organizationId === org);
        if (disambiguated) {
          return {
            organizationId: disambiguated.organizationId,
            contactId: disambiguated.id,
            matchedOn: 'contact_email',
          };
        }
      }
    }
  }

  return null;
}

// ---------- Ingest ----------

/**
 * End-to-end inbound ingest: dedup, match to a thread, persist the message,
 * update contact last-contacted, log activity, enqueue reply analysis.
 */
export async function ingestInbound(inbound: NormalizedInbound): Promise<IngestResult> {
  if (!inbound.fromEmail || !inbound.textBody) {
    return { status: 'error', reason: 'missing from or body' };
  }

  if (inbound.messageId) {
    const [existing] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.externalMessageId, inbound.messageId))
      .limit(1);
    if (existing) {
      return { status: 'duplicate', messageId: existing.id };
    }
  }

  const match = await matchThread(inbound);
  if (!match) {
    logger.info({ from: inbound.fromEmail, subject: inbound.subject }, 'Inbound email unmatched');
    return { status: 'unmatched', reason: 'no matching contact or thread' };
  }

  const threadId =
    match.threadId ?? inbound.inReplyTo ?? inbound.references[0] ?? inbound.messageId ?? null;

  const [inserted] = await db
    .insert(messages)
    .values({
      organizationId: match.organizationId,
      contactId: match.contactId,
      campaignLeadId: match.campaignLeadId ?? null,
      agentId: match.agentId ?? null,
      channel: 'email',
      direction: 'inbound',
      subject: inbound.subject,
      bodyText: inbound.textBody,
      bodyHtml: inbound.htmlBody ?? null,
      externalMessageId: inbound.messageId ?? null,
      threadId,
      status: 'delivered',
      repliedAt: inbound.receivedAt,
      metadata: {
        inReplyTo: inbound.inReplyTo ?? null,
        references: inbound.references,
        matchedOn: match.matchedOn,
      },
    })
    .returning({ id: messages.id });

  if (!inserted) return { status: 'error', reason: 'insert failed' };

  await db
    .update(contacts)
    .set({ lastContactedAt: inbound.receivedAt, updatedAt: new Date() })
    .where(eq(contacts.id, match.contactId));

  await db.insert(activities).values({
    organizationId: match.organizationId,
    contactId: match.contactId,
    activityType: 'email_replied',
    description: `Inbound reply: ${inbound.subject || '(no subject)'}`,
    metadata: { messageId: inserted.id, matchedOn: match.matchedOn },
  });

  await replyQueue.add('analyze_reply', { messageId: inserted.id });

  return {
    status: 'ingested',
    messageId: inserted.id,
    contactId: match.contactId,
    threadId: threadId ?? undefined,
  };
}

