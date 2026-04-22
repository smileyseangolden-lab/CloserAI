import { and, eq, lte, or, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { campaignLeads, campaigns, organizations } from '../../db/schema.js';
import { campaignQueue } from '../queue.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

/**
 * Periodically polls for campaign leads whose next_step_scheduled_at <= now
 * and queues them for execution.
 *
 * Two pacing controls apply before we enqueue:
 *  1. CAMPAIGN_SCHEDULER_INTERVAL_MS (default 30s, 0 disables).
 *  2. per-org `organizations.settings.pauseOutbound` kill switch — if true,
 *     we skip that org's leads until it's flipped back.
 */
export function startCampaignScheduler() {
  const interval = env.CAMPAIGN_SCHEDULER_INTERVAL_MS;
  if (interval <= 0) {
    logger.info('Campaign scheduler disabled (CAMPAIGN_SCHEDULER_INTERVAL_MS=0)');
    return;
  }
  logger.info({ intervalMs: interval }, 'Starting campaign scheduler');

  async function tick() {
    try {
      const pausedOrgs = await loadPausedOrgIds();

      const due = await db
        .select({ id: campaignLeads.id, organizationId: campaigns.organizationId })
        .from(campaignLeads)
        .innerJoin(campaigns, eq(campaignLeads.campaignId, campaigns.id))
        .where(
          and(
            eq(campaigns.status, 'active'),
            or(
              eq(campaignLeads.status, 'queued'),
              eq(campaignLeads.status, 'active'),
            ),
            or(
              isNull(campaignLeads.nextStepScheduledAt),
              lte(campaignLeads.nextStepScheduledAt, new Date()),
            ),
          ),
        )
        .limit(500);

      const queueable = due.filter((row) => !pausedOrgs.has(row.organizationId));
      const skipped = due.length - queueable.length;
      if (queueable.length > 0) {
        logger.info(
          { count: queueable.length, skippedForPause: skipped },
          'Queueing due campaign steps',
        );
        await Promise.all(
          queueable.map((row) =>
            campaignQueue.add(
              'execute_campaign_step',
              { campaignLeadId: row.id },
              { removeOnComplete: true, attempts: 3 },
            ),
          ),
        );
      } else if (skipped > 0) {
        logger.debug({ skipped }, 'All due campaign steps belong to paused orgs');
      }
    } catch (err) {
      logger.error({ err }, 'Campaign scheduler tick failed');
    }
  }

  void tick();
  setInterval(tick, interval);
}

async function loadPausedOrgIds(): Promise<Set<string>> {
  try {
    const rows = await db
      .select({ id: organizations.id, settings: organizations.settings })
      .from(organizations);
    const paused = new Set<string>();
    for (const row of rows) {
      const s = (row.settings ?? {}) as Record<string, unknown>;
      if (s.pauseOutbound === true) paused.add(row.id);
    }
    return paused;
  } catch (err) {
    logger.warn({ err }, 'Failed to load paused orgs — defaulting to none');
    return new Set();
  }
}
