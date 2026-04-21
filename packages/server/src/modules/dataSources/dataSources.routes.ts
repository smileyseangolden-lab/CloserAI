import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { dataSources } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { PROVIDER_CATALOG } from '../admin/catalog.js';

export const dataSourcesRouter = Router();

const writeSchema = z.object({
  providerKey: z.string().min(1),
  providerName: z.string().min(1),
  category: z.string().optional(),
  tier: z.enum(['starter', 'scale', 'enterprise']).optional(),
  status: z.enum(['recommended', 'connected', 'skipped', 'error']).optional(),
  monthlyBudgetUsd: z.number().nonnegative().optional(),
  estimatedMonthlyCostUsd: z.number().nonnegative().optional(),
  enrichmentRules: z.record(z.unknown()).optional(),
  reasoning: z.string().optional(),
});

dataSourcesRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

dataSourcesRouter.get('/catalog', (_req, res) => {
  // Expose the subset of PROVIDER_CATALOG that makes sense as a prospecting
  // or enrichment source — skip the AI/general buckets that are admin-only.
  res.json(
    PROVIDER_CATALOG.filter((p) => ['enrichment', 'linkedin', 'email'].includes(p.category)).map(
      (p) => ({
        key: p.key,
        name: p.name,
        category: p.category,
        vendor: p.vendor,
        description: p.description,
        docsUrl: p.docsUrl,
      }),
    ),
  );
});

dataSourcesRouter.post('/', validateBody(writeSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof writeSchema>;
    const [existing] = await db
      .select()
      .from(dataSources)
      .where(
        and(
          eq(dataSources.organizationId, req.auth!.organizationId),
          eq(dataSources.providerKey, body.providerKey),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(dataSources)
        .set({
          ...body,
          estimatedMonthlyCostUsd:
            body.estimatedMonthlyCostUsd !== undefined
              ? String(body.estimatedMonthlyCostUsd)
              : undefined,
          monthlyBudgetUsd:
            body.monthlyBudgetUsd !== undefined ? String(body.monthlyBudgetUsd) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(dataSources.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db
      .insert(dataSources)
      .values({
        ...body,
        organizationId: req.auth!.organizationId,
        estimatedMonthlyCostUsd:
          body.estimatedMonthlyCostUsd !== undefined
            ? String(body.estimatedMonthlyCostUsd)
            : undefined,
        monthlyBudgetUsd:
          body.monthlyBudgetUsd !== undefined ? String(body.monthlyBudgetUsd) : undefined,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

dataSourcesRouter.patch(
  '/:id',
  validateBody(writeSchema.partial()),
  async (req, res, next) => {
    try {
      const body = req.body as Partial<z.infer<typeof writeSchema>>;
      const [updated] = await db
        .update(dataSources)
        .set({
          ...body,
          estimatedMonthlyCostUsd:
            body.estimatedMonthlyCostUsd !== undefined
              ? String(body.estimatedMonthlyCostUsd)
              : undefined,
          monthlyBudgetUsd:
            body.monthlyBudgetUsd !== undefined ? String(body.monthlyBudgetUsd) : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dataSources.id, req.params.id!),
            eq(dataSources.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundError('Data source');
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

dataSourcesRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .delete(dataSources)
      .where(
        and(
          eq(dataSources.id, req.params.id!),
          eq(dataSources.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
