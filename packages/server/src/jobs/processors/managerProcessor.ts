import type { Job } from 'bullmq';
import { runManager } from '../../modules/managers/managerAnalyzers.js';
import { logger } from '../../utils/logger.js';

export async function processManagerJob(job: Job<{ managerAgentId: string }>) {
  const { managerAgentId } = job.data;
  const result = await runManager(managerAgentId);
  if (result) {
    logger.info(
      {
        managerAgentId,
        digestId: result.digestId,
        proposalsCreated: result.proposalsCreated,
        knowledgeCreated: result.knowledgeCreated,
      },
      'Manager run complete',
    );
  }
}
