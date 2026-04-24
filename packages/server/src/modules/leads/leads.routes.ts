import { Router } from 'express';
import { and, eq, isNull, desc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { leads, contacts, activities } from '../../db/schema.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { scoreLead } from '../ai/leadScorer.js';

export const leadsRouter = Router();

const leadSchema = z.object({
  companyName: z.string().min(1),
  companyWebsite: z.string().url().optional(),
  companyIndustry: z.string().optional(),
  companySize: z.string().optional(),
  companyRevenueRange: z.string().optional(),
  companyLocation: z.string().optional(),
  companyLinkedinUrl: z.string().url().optional(),
  companyDescription: z.string().optional(),
  icpId: z.string().uuid().optional(),
  source: z
    .enum(['scraped', 'uploaded', 'manual', 'inbound', 'referral', 'enriched'])
    .optional(),
  sourceDetail: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  icpId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
});

leadsRouter.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const q = (req as typeof req & { validatedQuery: z.infer<typeof listQuerySchema> })
      .validatedQuery;
    const conditions = [
      eq(leads.organizationId, req.auth!.organizationId),
      isNull(leads.deletedAt),
    ];
    if (q.status) conditions.push(sql`${leads.status}::text = ${q.status}`);
    if (q.icpId) conditions.push(eq(leads.icpId, q.icpId));
    if (q.minScore !== undefined) conditions.push(sql`${leads.leadScore} >= ${q.minScore}`);

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.leadScore), desc(leads.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(leads)
        .where(and(...conditions)),
    ]);

    res.json({
      data: rows,
      limit: q.limit,
      offset: q.offset,
      total: totalRow[0]?.total ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/', validateBody(leadSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(leads)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();

    if (created) {
      await db.insert(activities).values({
        organizationId: req.auth!.organizationId,
        leadId: created.id,
        userId: req.auth!.userId,
        activityType: 'lead_created',
        description: `Lead ${created.companyName} created manually`,
      });
    }

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const bulkImportSchema = z.object({
  leads: z.array(leadSchema).min(1).max(1000),
});

leadsRouter.post('/bulk-import', validateBody(bulkImportSchema), async (req, res, next) => {
  try {
    const rows = await db
      .insert(leads)
      .values(
        req.body.leads.map((l: z.infer<typeof leadSchema>) => ({
          ...l,
          organizationId: req.auth!.organizationId,
          source: l.source ?? 'uploaded',
        })),
      )
      .returning();
    res.status(201).json({ imported: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

leadsRouter.get('/:id', async (req, res, next) => {
  try {
    const [lead] = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.id, req.params.id!),
          eq(leads.organizationId, req.auth!.organizationId),
          isNull(leads.deletedAt),
        ),
      )
      .limit(1);
    if (!lead) throw new NotFoundError('Lead');

    const leadContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.leadId, lead.id), isNull(contacts.deletedAt)));

    res.json({ ...lead, contacts: leadContacts });
  } catch (err) {
    next(err);
  }
});

leadsRouter.patch('/:id', validateBody(leadSchema.partial()), async (req, res, next) => {
  try {
    const [updated] = await db
      .update(leads)
      .set({ ...req.body, updatedAt: new Date() })
      .where(
        and(
          eq(leads.id, req.params.id!),
          eq(leads.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundError('Lead');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

leadsRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .update(leads)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(leads.id, req.params.id!),
          eq(leads.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

leadsRouter.post('/:id/score', async (req, res, next) => {
  try {
    const result = await scoreLead(req.params.id!, req.auth!.organizationId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['delete', 'tag', 'change_status']),
  tag: z.string().optional(),
  status: z
    .enum(['new', 'contacted', 'engaging', 'warm', 'hot', 'qualified', 'disqualified', 'converted', 'lost'])
    .optional(),
});

leadsRouter.post('/bulk-action', validateBody(bulkActionSchema), async (req, res, next) => {
  try {
    const { ids, action, tag, status } = req.body as z.infer<typeof bulkActionSchema>;
    const whereClause = and(
      inArray(leads.id, ids),
      eq(leads.organizationId, req.auth!.organizationId),
    );

    if (action === 'delete') {
      await db.update(leads).set({ deletedAt: new Date() }).where(whereClause);
    } else if (action === 'tag' && tag) {
      await db
        .update(leads)
        .set({ tags: sql`array_append(coalesce(${leads.tags}, ARRAY[]::text[]), ${tag})` })
        .where(whereClause);
    } else if (action === 'change_status' && status) {
      await db
        .update(leads)
        .set({ status, statusChangedAt: new Date() })
        .where(whereClause);
    }

    res.json({ affected: ids.length });
  } catch (err) {
    next(err);
  }
});
