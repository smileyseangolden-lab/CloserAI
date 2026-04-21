import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export type JobName =
  | 'send_email'
  | 'send_linkedin'
  | 'enrich_lead'
  | 'score_lead'
  | 'ai_generate'
  | 'scrape_leads'
  | 'warmup_email'
  | 'sync_inbox'
  | 'analyze_reply'
  | 'execute_campaign_step'
  | 'analyze_optimization';

export const sendQueue = new Queue<{ messageId: string }>('send', { connection });
export const enrichQueue = new Queue<{ leadId: string; organizationId: string }>('enrich', {
  connection,
});
export const scoreQueue = new Queue<{ leadId: string; organizationId: string }>('score', {
  connection,
});
export const campaignQueue = new Queue<{ campaignLeadId: string }>('campaign', { connection });
export const replyQueue = new Queue<{ messageId: string }>('reply', { connection });
export const optimizationQueue = new Queue<{ organizationId: string }>('optimization', {
  connection,
});
export const managerQueue = new Queue<{ managerAgentId: string }>('manager', { connection });

export const sendEvents = new QueueEvents('send', { connection });
export const campaignEvents = new QueueEvents('campaign', { connection });
