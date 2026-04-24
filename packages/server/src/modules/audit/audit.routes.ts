import { Router } from 'express';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { auditLog, users } from '../../db/schema.js';
import { validateQuery } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/auth.js';

export const auditRouter = Router();

const querySchema = z.object({
  resourceType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Audit log viewer. Admins and owners see every audit_log row for their org,
 * joined with user first/last name for display. Writers across the app still
 * need to be hooked up — today only bits of the org/deployment surface emit
 * audit rows, so this list may be sparse at first.
 */
auditRouter.get(
  '/',
  requireRole('owner', 'admin'),
  validateQuery(querySchema),
  async (req, res, next) => {
    try {
      const q = (req as typeof req & { validatedQuery: z.infer<typeof querySchema> })
        .validatedQuery;
      const orgId = req.auth!.organizationId;
      const conditions = [eq(auditLog.organizationId, orgId)];
      if (q.resourceType) conditions.push(eq(auditLog.resourceType, q.resourceType));
      if (q.action) conditions.push(eq(auditLog.action, q.action));
      if (q.userId) conditions.push(eq(auditLog.userId, q.userId));
      if (q.from) conditions.push(gte(auditLog.createdAt, new Date(q.from)));
      if (q.to) conditions.push(lte(auditLog.createdAt, new Date(q.to)));
      const where = and(...conditions);

      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            resourceType: auditLog.resourceType,
            resourceId: auditLog.resourceId,
            changes: auditLog.changes,
            ipAddress: auditLog.ipAddress,
            createdAt: auditLog.createdAt,
            userId: auditLog.userId,
            userFirstName: users.firstName,
            userLastName: users.lastName,
            userEmail: users.email,
          })
          .from(auditLog)
          .leftJoin(users, eq(auditLog.userId, users.id))
          .where(where)
          .orderBy(desc(auditLog.createdAt))
          .limit(q.limit)
          .offset(q.offset),
        db.select({ total: sql<number>`count(*)::int` }).from(auditLog).where(where),
      ]);

      res.json({
        data: rows,
        total: totalRow[0]?.total ?? 0,
        limit: q.limit,
        offset: q.offset,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Distinct resourceType + action values present in the org's audit log, so the
 * viewer can populate its filter dropdowns without hard-coding a list.
 */
auditRouter.get('/meta', requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;

    const [resources, actions] = await Promise.all([
      db
        .selectDistinct({ resourceType: auditLog.resourceType })
        .from(auditLog)
        .where(eq(auditLog.organizationId, orgId))
        .orderBy(auditLog.resourceType),
      db
        .selectDistinct({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.organizationId, orgId))
        .orderBy(auditLog.action),
    ]);

    res.json({
      resourceTypes: resources.map((r) => r.resourceType).filter(Boolean),
      actions: actions.map((a) => a.action).filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});
