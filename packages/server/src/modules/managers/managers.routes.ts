import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { managerAgents, managerDigests } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { managerQueue } from '../../jobs/queue.js';
import { MANAGER_BLUEPRINTS, nextRunAtFor, type ManagerRole } from './managerBlueprints.js';

export const managersRouter = Router();

// ---- catalog --------------------------------------------------------------

managersRouter.get('/catalog', (_req, res) => {
  res.json(Object.values(MANAGER_BLUEPRINTS));
});

// ---- list + single -------------------------------------------------------

managersRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(managerAgents)
      .where(eq(managerAgents.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

managersRouter.get('/:id', async (req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(managerAgents)
      .where(
        and(
          eq(managerAgents.id, req.params.id!),
          eq(managerAgents.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Manager agent');
    const digests = await db
      .select()
      .from(managerDigests)
      .where(eq(managerDigests.managerAgentId, row.id))
      .orderBy(desc(managerDigests.createdAt))
      .limit(20);
    res.json({ ...row, digests });
  } catch (err) {
    next(err);
  }
});

// ---- enable (activate from blueprint) ------------------------------------

const enableSchema = z.object({
  role: z.enum(['sales_manager', 'marketing_manager', 'cro']),
  cadence: z.enum(['hourly', 'daily', 'weekly', 'manual']).optional(),
});

managersRouter.post('/enable', validateBody(enableSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof enableSchema>;
    const blueprint = MANAGER_BLUEPRINTS[body.role as ManagerRole];
    const cadence = body.cadence ?? blueprint.cadence;
    const orgId = req.auth!.organizationId;

    const [existing] = await db
      .select()
      .from(managerAgents)
      .where(and(eq(managerAgents.organizationId, orgId), eq(managerAgents.role, body.role)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(managerAgents)
        .set({
          cadence,
          isActive: true,
          nextRunAt: nextRunAtFor(cadence) ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(managerAgents.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db
      .insert(managerAgents)
      .values({
        organizationId: orgId,
        role: body.role,
        name: blueprint.name,
        description: blueprint.description,
        cadence,
        isActive: true,
        nextRunAt: new Date(), // run on the next scheduler tick
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ---- update --------------------------------------------------------------

const updateSchema = z.object({
  cadence: z.enum(['hourly', 'daily', 'weekly', 'manual']).optional(),
  isActive: z.boolean().optional(),
  systemPromptOverride: z.string().nullable().optional(),
  config: z.record(z.unknown()).optional(),
});

managersRouter.patch('/:id', validateBody(updateSchema), async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;
    const [existing] = await db
      .select()
      .from(managerAgents)
      .where(and(eq(managerAgents.id, req.params.id!), eq(managerAgents.organizationId, orgId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Manager agent');

    const patch: Partial<typeof managerAgents.$inferInsert> = {
      ...req.body,
      updatedAt: new Date(),
    };
    if (req.body.cadence && req.body.cadence !== existing.cadence) {
      patch.nextRunAt = nextRunAtFor(req.body.cadence) ?? new Date();
    }
    if (req.body.isActive === true && !existing.isActive) {
      patch.nextRunAt = new Date();
    }
    const [updated] = await db
      .update(managerAgents)
      .set(patch)
      .where(eq(managerAgents.id, existing.id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

managersRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .delete(managerAgents)
      .where(
        and(
          eq(managerAgents.id, req.params.id!),
          eq(managerAgents.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- run now (enqueue) ---------------------------------------------------

managersRouter.post('/:id/run-now', async (req, res, next) => {
  try {
    const [mgr] = await db
      .select()
      .from(managerAgents)
      .where(
        and(
          eq(managerAgents.id, req.params.id!),
          eq(managerAgents.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!mgr) throw new NotFoundError('Manager agent');

    await managerQueue.add(
      'run_manager_agent',
      { managerAgentId: mgr.id },
      {
        removeOnComplete: true,
        attempts: 1,
        jobId: `mgr:${mgr.id}:manual:${Date.now()}`,
      },
    );
    res.status(202).json({ queued: true });
  } catch (err) {
    next(err);
  }
});

// ---- digests list --------------------------------------------------------

managersRouter.get('/digests/recent', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(managerDigests)
      .where(eq(managerDigests.organizationId, req.auth!.organizationId))
      .orderBy(desc(managerDigests.createdAt))
      .limit(50);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
