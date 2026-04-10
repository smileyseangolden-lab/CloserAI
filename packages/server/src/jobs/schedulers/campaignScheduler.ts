import { and, eq, lte, or, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { campaignLeads, campaigns } from '../../db/schema.js';
import { campaignQueue } from '../queue.js';
import { logger } from '../../utils/logger.js';

const TICK_INTERVAL_MS = 30_000;

/**
 * Periodically polls for campaign leads whose next_step_scheduled_at <= now
 * and queues them for execution.
 */
export function startCampaignScheduler() {
  logger.info('Starting campaign scheduler (tick every 30s)');

  async function tick() {
    try {
      const due = await db
        .select({ id: campaignLeads.id })
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

      if (due.length > 0) {
        logger.info({ count: due.length }, 'Queueing due campaign steps');
        await Promise.all(
          due.map((row) =>
            campaignQueue.add(
              'execute_campaign_step',
              { campaignLeadId: row.id },
              { removeOnComplete: true, attempts: 3 },
            ),
          ),
        );
      }
    } catch (err) {
      logger.error({ err }, 'Campaign scheduler tick failed');
    }
  }

  void tick();
  setInterval(tick, TICK_INTERVAL_MS);
}
