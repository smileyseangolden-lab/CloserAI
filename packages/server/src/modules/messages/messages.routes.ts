import { Router } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { messages, contacts } from '../../db/schema.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { generateMessageDraft } from '../ai/messageGenerator.js';
import { analyzeReply } from '../ai/replyAnalyzer.js';

export const messagesRouter = Router();

const listQuerySchema = z.object({
  contactId: z.string().uuid().optional(),
  campaignLeadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

messagesRouter.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const q = (req as typeof req & { validatedQuery: z.infer<typeof listQuerySchema> })
      .validatedQuery;
    const conditions = [eq(messages.organizationId, req.auth!.organizationId)];
    if (q.contactId) conditions.push(eq(messages.contactId, q.contactId));
    if (q.campaignLeadId) conditions.push(eq(messages.campaignLeadId, q.campaignLeadId));

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(q.limit);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const sendSchema = z.object({
  contactId: z.string().uuid(),
  campaignLeadId: z.string().uuid().optional(),
  channel: z.enum(['email', 'linkedin', 'phone', 'sms', 'internal_note']),
  subject: z.string().optional(),
  bodyText: z.string().min(1),
  bodyHtml: z.string().optional(),
});

messagesRouter.post('/', validateBody(sendSchema), async (req, res, next) => {
  try {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, req.body.contactId),
          eq(contacts.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!contact) throw new ForbiddenError('Contact not in your organization');

    const [created] = await db
      .insert(messages)
      .values({
        ...req.body,
        organizationId: req.auth!.organizationId,
        direction: 'outbound',
        status: 'queued',
        userId: req.auth!.userId,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const draftSchema = z.object({
  agentId: z.string().uuid(),
  contactId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  stepId: z.string().uuid().optional(),
  instructions: z.string().optional(),
});

messagesRouter.post('/draft', validateBody(draftSchema), async (req, res, next) => {
  try {
    const draft = await generateMessageDraft({
      ...req.body,
      organizationId: req.auth!.organizationId,
    });
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

const analyzeSchema = z.object({
  messageId: z.string().uuid(),
});

messagesRouter.post('/analyze-reply', validateBody(analyzeSchema), async (req, res, next) => {
  try {
    const [msg] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, req.body.messageId),
          eq(messages.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!msg) throw new NotFoundError('Message');
    const analysis = await analyzeReply(msg.bodyText, req.auth!.organizationId);

    await db
      .update(messages)
      .set({
        intentClassification: analysis.intent,
        sentimentScore: analysis.sentiment,
      })
      .where(eq(messages.id, msg.id));

    res.json(analysis);
  } catch (err) {
    next(err);
  }
});
