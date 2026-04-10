import { Router } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { activities } from '../../db/schema.js';
import { validateQuery } from '../../middleware/validate.js';

export const activitiesRouter = Router();

const querySchema = z.object({
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

activitiesRouter.get('/', validateQuery(querySchema), async (req, res, next) => {
  try {
    const q = (req as typeof req & { validatedQuery: z.infer<typeof querySchema> })
      .validatedQuery;
    const conditions = [eq(activities.organizationId, req.auth!.organizationId)];
    if (q.leadId) conditions.push(eq(activities.leadId, q.leadId));
    if (q.contactId) conditions.push(eq(activities.contactId, q.contactId));
    if (q.campaignId) conditions.push(eq(activities.campaignId, q.campaignId));

    const rows = await db
      .select()
      .from(activities)
      .where(and(...conditions))
      .orderBy(desc(activities.createdAt))
      .limit(q.limit);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
