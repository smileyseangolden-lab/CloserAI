import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { workspaceStages } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { STAGE_DEFINITIONS, isValidStageId } from './workspace.stages.js';

export const workspaceRouter = Router();

workspaceRouter.get('/stages', async (_req, res) => {
  res.json(
    STAGE_DEFINITIONS.map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      description: s.description,
      openingPrompt: s.openingPrompt,
    })),
  );
});

workspaceRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(workspaceStages)
      .where(eq(workspaceStages.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

workspaceRouter.get('/:stageId', async (req, res, next) => {
  try {
    const { stageId } = req.params;
    if (!stageId || !isValidStageId(stageId)) {
      throw new ValidationError('Invalid stage id');
    }
    const [row] = await db
      .select()
      .from(workspaceStages)
      .where(
        and(
          eq(workspaceStages.organizationId, req.auth!.organizationId),
          eq(workspaceStages.stageId, stageId),
        ),
      )
      .limit(1);
    res.json(row ?? null);
  } catch (err) {
    next(err);
  }
});

const saveSchema = z.object({
  data: z.record(z.unknown()),
  status: z.enum(['in_progress', 'approved']).optional(),
});

workspaceRouter.put('/:stageId', validateBody(saveSchema), async (req, res, next) => {
  try {
    const { stageId } = req.params;
    if (!stageId || !isValidStageId(stageId)) {
      throw new ValidationError('Invalid stage id');
    }
    const orgId = req.auth!.organizationId;
    const status = req.body.status ?? 'in_progress';
    const approvedAt = status === 'approved' ? new Date() : null;

    const [existing] = await db
      .select()
      .from(workspaceStages)
      .where(
        and(
          eq(workspaceStages.organizationId, orgId),
          eq(workspaceStages.stageId, stageId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(workspaceStages)
        .set({
          data: req.body.data,
          status,
          approvedAt: approvedAt ?? existing.approvedAt,
          version: existing.version + 1,
          updatedByUserId: req.auth!.userId,
          updatedAt: new Date(),
        })
        .where(eq(workspaceStages.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db
      .insert(workspaceStages)
      .values({
        organizationId: orgId,
        stageId,
        data: req.body.data,
        status,
        approvedAt,
        updatedByUserId: req.auth!.userId,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

workspaceRouter.delete('/:stageId', async (req, res, next) => {
  try {
    const { stageId } = req.params;
    if (!stageId || !isValidStageId(stageId)) {
      throw new ValidationError('Invalid stage id');
    }
    const result = await db
      .delete(workspaceStages)
      .where(
        and(
          eq(workspaceStages.organizationId, req.auth!.organizationId),
          eq(workspaceStages.stageId, stageId),
        ),
      );
    if (!result.rowCount) throw new NotFoundError('Stage');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
