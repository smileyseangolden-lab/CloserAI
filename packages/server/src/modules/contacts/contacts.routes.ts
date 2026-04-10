import { Router } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { contacts, leads } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';

export const contactsRouter = Router();

const contactSchema = z.object({
  leadId: z.string().uuid(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  seniorityLevel: z
    .enum(['c_suite', 'vp', 'director', 'manager', 'senior', 'mid', 'junior', 'intern'])
    .optional(),
  linkedinUrl: z.string().url().optional(),
  twitterUrl: z.string().url().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
  profilePhotoUrl: z.string().url().optional(),
  isPrimary: z.boolean().optional(),
  isDecisionMaker: z.boolean().optional(),
  preferredChannel: z.enum(['email', 'linkedin', 'phone', 'sms']).optional(),
  timezone: z.string().optional(),
});

contactsRouter.post('/', validateBody(contactSchema), async (req, res, next) => {
  try {
    // Verify lead belongs to org
    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.id, req.body.leadId),
          eq(leads.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!lead) throw new ForbiddenError('Lead not in your organization');

    const [created] = await db
      .insert(contacts)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

contactsRouter.get('/:id', async (req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, req.params.id!),
          eq(contacts.organizationId, req.auth!.organizationId),
          isNull(contacts.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Contact');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

contactsRouter.patch(
  '/:id',
  validateBody(contactSchema.partial().omit({ leadId: true })),
  async (req, res, next) => {
    try {
      const [updated] = await db
        .update(contacts)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(contacts.id, req.params.id!),
            eq(contacts.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundError('Contact');
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

contactsRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .update(contacts)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(contacts.id, req.params.id!),
          eq(contacts.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

contactsRouter.post('/:id/do-not-contact', async (req, res, next) => {
  try {
    await db
      .update(contacts)
      .set({ doNotContact: true, updatedAt: new Date() })
      .where(
        and(
          eq(contacts.id, req.params.id!),
          eq(contacts.organizationId, req.auth!.organizationId),
        ),
      );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
