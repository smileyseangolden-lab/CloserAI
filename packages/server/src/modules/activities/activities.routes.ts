import { Router } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { activities, users } from '../../db/schema.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';

export const activitiesRouter = Router();

const querySchema = z.object({
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  activityType: z.string().optional(),
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
    if (q.activityType) conditions.push(eq(activities.activityType, q.activityType as never));

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

// Notes are modelled as activities with activityType = 'note_added'. The
// routes below wrap that so the UI doesn't have to know the underlying shape.

const notesQuerySchema = z.object({
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

activitiesRouter.get(
  '/notes',
  validateQuery(notesQuerySchema),
  async (req, res, next) => {
    try {
      const q = (req as typeof req & { validatedQuery: z.infer<typeof notesQuerySchema> })
        .validatedQuery;
      const conditions = [
        eq(activities.organizationId, req.auth!.organizationId),
        eq(activities.activityType, 'note_added'),
      ];
      if (q.leadId) conditions.push(eq(activities.leadId, q.leadId));
      if (q.contactId) conditions.push(eq(activities.contactId, q.contactId));
      if (q.campaignId) conditions.push(eq(activities.campaignId, q.campaignId));

      const rows = await db
        .select({
          id: activities.id,
          body: activities.description,
          leadId: activities.leadId,
          contactId: activities.contactId,
          campaignId: activities.campaignId,
          userId: activities.userId,
          createdAt: activities.createdAt,
          authorFirstName: users.firstName,
          authorLastName: users.lastName,
        })
        .from(activities)
        .leftJoin(users, eq(activities.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(activities.createdAt))
        .limit(q.limit);

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

const createNoteSchema = z
  .object({
    body: z.string().trim().min(1, 'body is required').max(5000),
    leadId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.leadId || v.contactId || v.campaignId),
    'One of leadId, contactId, or campaignId is required',
  );

activitiesRouter.post(
  '/notes',
  validateBody(createNoteSchema),
  async (req, res, next) => {
    try {
      const { body, leadId, contactId, campaignId } = req.body as z.infer<
        typeof createNoteSchema
      >;
      const [created] = await db
        .insert(activities)
        .values({
          organizationId: req.auth!.organizationId,
          userId: req.auth!.userId,
          leadId: leadId ?? null,
          contactId: contactId ?? null,
          campaignId: campaignId ?? null,
          activityType: 'note_added',
          description: body,
        })
        .returning();

      if (!created) {
        res.status(500).json({ error: 'Failed to create note' });
        return;
      }

      const [withAuthor] = await db
        .select({
          id: activities.id,
          body: activities.description,
          leadId: activities.leadId,
          contactId: activities.contactId,
          campaignId: activities.campaignId,
          userId: activities.userId,
          createdAt: activities.createdAt,
          authorFirstName: users.firstName,
          authorLastName: users.lastName,
        })
        .from(activities)
        .leftJoin(users, eq(activities.userId, users.id))
        .where(eq(activities.id, created.id));

      res.status(201).json(withAuthor ?? created);
    } catch (err) {
      next(err);
    }
  },
);

activitiesRouter.delete('/notes/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const [row] = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.id, id),
          eq(activities.organizationId, req.auth!.organizationId),
          eq(activities.activityType, 'note_added'),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }

    // Only the note author (or an admin/owner) can delete.
    const role = req.auth!.role;
    const isAdmin = role === 'owner' || role === 'admin';
    if (!isAdmin && row.userId !== req.auth!.userId) {
      res.status(403).json({ error: 'Not allowed to delete this note' });
      return;
    }

    await db.delete(activities).where(eq(activities.id, id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
