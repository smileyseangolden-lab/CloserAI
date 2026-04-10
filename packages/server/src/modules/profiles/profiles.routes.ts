import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { businessProfiles } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { analyzeBusiness } from '../ai/businessAnalyzer.js';

export const profilesRouter = Router();

const upsertSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().optional(),
  subIndustry: z.string().optional(),
  companySize: z
    .enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'])
    .optional(),
  annualRevenueRange: z.string().optional(),
  headquartersLocation: z.string().optional(),
  website: z.string().url().optional(),
  valueProposition: z.string().optional(),
  keyDifferentiators: z.array(z.string()).optional(),
  targetVerticals: z.array(z.string()).optional(),
  productsServices: z.array(z.record(z.unknown())).optional(),
  competitors: z.array(z.string()).optional(),
  painPointsSolved: z.array(z.string()).optional(),
});

profilesRouter.get('/', async (req, res, next) => {
  try {
    const [profile] = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.organizationId, req.auth!.organizationId))
      .limit(1);
    res.json(profile ?? null);
  } catch (err) {
    next(err);
  }
});

profilesRouter.put('/', validateBody(upsertSchema), async (req, res, next) => {
  try {
    const existing = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.organizationId, req.auth!.organizationId))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(businessProfiles)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(businessProfiles.organizationId, req.auth!.organizationId))
        .returning();
      return res.json(updated);
    }

    const [created] = await db
      .insert(businessProfiles)
      .values({ ...req.body, organizationId: req.auth!.organizationId })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const analyzeSchema = z.object({
  websiteUrl: z.string().url(),
});

profilesRouter.post('/analyze', validateBody(analyzeSchema), async (req, res, next) => {
  try {
    const analysis = await analyzeBusiness(req.body.websiteUrl, req.auth!.organizationId);
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});
