import type { Job } from 'bullmq';
import { scoreLead } from '../../modules/ai/leadScorer.js';

export async function processScoreJob(job: Job<{ leadId: string; organizationId: string }>) {
  const { leadId, organizationId } = job.data;
  await scoreLead(leadId, organizationId);
}
