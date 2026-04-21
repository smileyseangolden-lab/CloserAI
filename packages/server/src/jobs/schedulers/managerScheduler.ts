import { and, eq, lte, or, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { managerAgents } from '../../db/schema.js';
import { managerQueue } from '../queue.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

/**
 * Ticks every MANAGER_SCHEDULER_INTERVAL_MS (default 10 min), picks every
 * active manager whose nextRunAt has passed, and enqueues a run_manager_agent
 * job. The processor updates nextRunAt when it finishes, so overlap is
 * naturally avoided — plus we dedupe via a time-bucketed jobId on top.
 */
export function startManagerScheduler() {
  const interval = env.MANAGER_SCHEDULER_INTERVAL_MS;
  if (interval <= 0) {
    logger.info('Manager scheduler disabled (MANAGER_SCHEDULER_INTERVAL_MS=0)');
    return;
  }
  logger.info({ intervalMs: interval }, 'Starting manager scheduler');

  async function tick() {
    try {
      const due = await db
        .select({ id: managerAgents.id })
        .from(managerAgents)
        .where(
          and(
            eq(managerAgents.isActive, true),
            or(
              isNull(managerAgents.nextRunAt),
              lte(managerAgents.nextRunAt, new Date()),
            ),
          ),
        )
        .limit(100);
      if (due.length === 0) return;
      logger.debug({ count: due.length }, 'Manager scheduler: enqueuing');
      const bucket = Math.floor(Date.now() / interval);
      await Promise.all(
        due.map((row) =>
          managerQueue.add(
            'run_manager_agent',
            { managerAgentId: row.id },
            {
              removeOnComplete: true,
              attempts: 1,
              jobId: `mgr:${row.id}:${bucket}`,
            },
          ),
        ),
      );
    } catch (err) {
      logger.error({ err }, 'Manager scheduler tick failed');
    }
  }

  setTimeout(() => void tick(), 30_000);
  setInterval(tick, interval);
}
