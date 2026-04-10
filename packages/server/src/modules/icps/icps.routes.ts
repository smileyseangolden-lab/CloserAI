import { Router } from 'express';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { idealCustomerProfiles } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { refineIcp } from '../ai/icpRefiner.js';

export const icpsRouter = Router();

const icpSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  targetIndustries: z.array(z.string()).optional(),
  targetCompanySizes: z.array(z.string()).optional(),
  targetRevenueRanges: z.array(z.string()).optional(),
  targetJobTitles: z.array(z.string()).optional(),
  targetDepartments: z.array(z.string()).optional(),
  targetGeographies: z.array(z.string()).optional(),
  technographics: z.record(z.unknown()).optional(),
  firmographics: z.record(z.unknown()).optional(),
  buyingSignals: z.array(z.string()).optional(),
  disqualifiers: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

icpsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(idealCustomerProfiles)
      .where(
        and(
          eq(idealCustomerProfiles.organizationId, req.auth!.organizationId),
          isNull(idealCustomerProfiles.deletedAt),
        ),
      )
      .orderBy(desc(idealCustomerProfiles.priority));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

icpsRouter.post('/', validateBody(icpSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(idealCustomerProfiles)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

icpsRouter.get('/:id', async (req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(idealCustomerProfiles)
      .where(
        and(
          eq(idealCustomerProfiles.id, req.params.id!),
          eq(idealCustomerProfiles.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('ICP');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

icpsRouter.patch('/:id', validateBody(icpSchema.partial()), async (req, res, next) => {
  try {
    const [updated] = await db
      .update(idealCustomerProfiles)
      .set({ ...req.body, updatedAt: new Date() })
      .where(
        and(
          eq(idealCustomerProfiles.id, req.params.id!),
          eq(idealCustomerProfiles.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundError('ICP');
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

icpsRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .update(idealCustomerProfiles)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(idealCustomerProfiles.id, req.params.id!),
          eq(idealCustomerProfiles.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

icpsRouter.post('/:id/refine', async (req, res, next) => {
  try {
    const notes = await refineIcp(req.params.id!, req.auth!.organizationId);
    res.json({ aiRefinementNotes: notes });
  } catch (err) {
    next(err);
  }
});
