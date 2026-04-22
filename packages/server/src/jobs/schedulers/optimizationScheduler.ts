import { eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { organizations } from '../../db/schema.js';
import { optimizationQueue } from '../queue.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

/**
 * Periodically enqueues one analyze_optimization job per active organisation.
 * The processor then decides whether to run (per-org toggle + API-key check)
 * and inserts optimization_proposals rows.
 *
 * Default cadence is every 6 hours (OPTIMIZATION_SCHEDULER_INTERVAL_MIN).
 * Setting the env var to 0 disables the scheduler entirely.
 */
export function startOptimizationScheduler() {
  const interval = env.OPTIMIZATION_SCHEDULER_INTERVAL_MIN;
  if (interval <= 0) {
    logger.info('Optimization scheduler disabled (OPTIMIZATION_SCHEDULER_INTERVAL_MIN=0)');
    return;
  }
  logger.info(
    { interval },
    'Starting optimization scheduler (tick every ${interval} minutes)',
  );

  async function tick() {
    try {
      const orgs = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(isNull(organizations.deletedAt));
      if (orgs.length === 0) return;
      await Promise.all(
        orgs.map((o) =>
          optimizationQueue.add(
            'analyze_optimization',
            { organizationId: o.id },
            {
              removeOnComplete: true,
              attempts: 1,
              // Dedupe per org: if a previous run hasn't finished, skip.
              jobId: `opt:${o.id}:${Math.floor(Date.now() / (interval * 60_000))}`,
            },
          ),
        ),
      );
      logger.debug({ count: orgs.length }, 'optimization scheduler: enqueued');
    } catch (err) {
      logger.error({ err }, 'Optimization scheduler tick failed');
    }
  }

  // Run once at boot (after a short delay so migrations + seeds settle), then
  // on every N-minute interval.
  setTimeout(() => void tick(), 60_000);
  setInterval(tick, interval * 60_000);
}

void eq; // reserved for future scoping by subscription tier