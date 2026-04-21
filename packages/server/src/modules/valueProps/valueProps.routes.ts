import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { competitiveMatrix, pricingTiers, valueProps } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';

export const valuePropsRouter = Router();

// ---- value_props ----------------------------------------------------------

const valuePropSchema = z.object({
  variant: z.enum(['technical', 'business_outcome', 'emotional']),
  headline: z.string().min(1),
  body: z.string().min(1),
  proofPoints: z.array(z.string()).optional(),
  targetPersona: z.string().optional(),
  icpTierId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

valuePropsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(valueProps)
      .where(eq(valueProps.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

valuePropsRouter.post('/', validateBody(valuePropSchema), async (req, res, next) => {
  try {
    const [row] = await db
      .insert(valueProps)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

valuePropsRouter.patch(
  '/:id',
  validateBody(valuePropSchema.partial()),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(valueProps)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(valueProps.id, req.params.id!),
            eq(valueProps.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Value prop');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

valuePropsRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .delete(valueProps)
      .where(
        and(
          eq(valueProps.id, req.params.id!),
          eq(valueProps.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- pricing_tiers --------------------------------------------------------

const pricingSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceMonthly: z.number().nonnegative().optional(),
  priceAnnual: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  features: z.array(z.string()).optional(),
  targetSegment: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

valuePropsRouter.get('/pricing', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(pricingTiers)
      .where(eq(pricingTiers.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

valuePropsRouter.post('/pricing', validateBody(pricingSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof pricingSchema>;
    const [row] = await db
      .insert(pricingTiers)
      .values({
        ...body,
        organizationId: req.auth!.organizationId,
        priceMonthly: body.priceMonthly !== undefined ? String(body.priceMonthly) : undefined,
        priceAnnual: body.priceAnnual !== undefined ? String(body.priceAnnual) : undefined,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

valuePropsRouter.patch(
  '/pricing/:id',
  validateBody(pricingSchema.partial()),
  async (req, res, next) => {
    try {
      const body = req.body as Partial<z.infer<typeof pricingSchema>>;
      const [row] = await db
        .update(pricingTiers)
        .set({
          ...body,
          priceMonthly: body.priceMonthly !== undefined ? String(body.priceMonthly) : undefined,
          priceAnnual: body.priceAnnual !== undefined ? String(body.priceAnnual) : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pricingTiers.id, req.params.id!),
            eq(pricingTiers.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Pricing tier');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

valuePropsRouter.delete('/pricing/:id', async (req, res, next) => {
  try {
    await db
      .delete(pricingTiers)
      .where(
        and(
          eq(pricingTiers.id, req.params.id!),
          eq(pricingTiers.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- competitive_matrix ---------------------------------------------------

const competitorSchema = z.object({
  competitor: z.string().min(1),
  competitorUrl: z.string().url().optional(),
  ourStrengths: z.array(z.string()).optional(),
  theirStrengths: z.array(z.string()).optional(),
  differentiators: z.array(z.string()).optional(),
  pricingNotes: z.string().optional(),
  sourceUrls: z.array(z.string().url()).optional(),
  g2Rating: z.number().min(0).max(5).optional(),
});

valuePropsRouter.get('/competitors', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(competitiveMatrix)
      .where(eq(competitiveMatrix.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

valuePropsRouter.post(
  '/competitors',
  validateBody(competitorSchema),
  async (req, res, next) => {
    try {
      const [row] = await db
        .insert(competitiveMatrix)
        .values({ ...req.body, organizationId: req.auth!.organizationId })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

valuePropsRouter.patch(
  '/competitors/:id',
  validateBody(competitorSchema.partial()),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(competitiveMatrix)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(competitiveMatrix.id, req.params.id!),
            eq(competitiveMatrix.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Competitor');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

valuePropsRouter.delete('/competitors/:id', async (req, res, next) => {
  try {
    await db
      .delete(competitiveMatrix)
      .where(
        and(
          eq(competitiveMatrix.id, req.params.id!),
          eq(competitiveMatrix.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
