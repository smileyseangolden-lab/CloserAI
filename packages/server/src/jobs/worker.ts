import { Worker } from 'bullmq';
import { connection } from './queue.js';
import { logger } from '../utils/logger.js';
import { processSendJob } from './processors/sendProcessor.js';
import { processEnrichJob } from './processors/enrichProcessor.js';
import { processScoreJob } from './processors/scoreProcessor.js';
import { processCampaignStepJob } from './processors/campaignProcessor.js';
import { processReplyJob } from './processors/replyProcessor.js';
import { processOptimizationJob } from './processors/optimizationProcessor.js';
import { startCampaignScheduler } from './schedulers/campaignScheduler.js';
import { startOptimizationScheduler } from './schedulers/optimizationScheduler.js';

logger.info('Starting CloserAI worker...');

new Worker('send', processSendJob, { connection, concurrency: 10 });
new Worker('enrich', processEnrichJob, { connection, concurrency: 5 });
new Worker('score', processScoreJob, { connection, concurrency: 10 });
new Worker('campaign', processCampaignStepJob, { connection, concurrency: 10 });
new Worker('reply', processReplyJob, { connection, concurrency: 10 });
new Worker('optimization', processOptimizationJob, { connection, concurrency: 2 });

startCampaignScheduler();
startOptimizationScheduler();

logger.info('Worker ready');
