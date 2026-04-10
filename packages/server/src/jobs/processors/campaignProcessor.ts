import type { Job } from 'bullmq';
import { and, eq, asc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  campaignLeads,
  cadenceSteps,
  campaigns,
  messages,
  activities,
} from '../../db/schema.js';
import { generateMessageDraft } from '../../modules/ai/messageGenerator.js';
import { sendQueue } from '../queue.js';
import { logger } from '../../utils/logger.js';

/**
 * Advances a single campaign_lead by one cadence step.
 * Handles:
 *  - Selecting the next step
 *  - Generating AI-personalized copy (or raw template)
 *  - Inserting a draft message
 *  - Queueing the send
 *  - Scheduling the next step's execution
 */
export async function processCampaignStepJob(job: Job<{ campaignLeadId: string }>) {
  const { campaignLeadId } = job.data;
  logger.info({ campaignLeadId }, 'Processing campaign step');

  const [cl] = await db
    .select()
    .from(campaignLeads)
    .where(eq(campaignLeads.id, campaignLeadId))
    .limit(1);
  if (!cl) return;
  if (cl.status !== 'active' && cl.status !== 'queued') return;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, cl.campaignId))
    .limit(1);
  if (!campaign || campaign.status !== 'active') return;

  const nextStepNumber = cl.currentStep + 1;
  const [step] = await db
    .select()
    .from(cadenceSteps)
    .where(and(eq(cadenceSteps.campaignId, cl.campaignId), eq(cadenceSteps.stepNumber, nextStepNumber)))
    .orderBy(asc(cadenceSteps.stepNumber))
    .limit(1);

  if (!step) {
    // No more steps — complete
    await db
      .update(campaignLeads)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(campaignLeads.id, campaignLeadId));
    await db.insert(activities).values({
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
      activityType: 'campaign_exited',
      description: 'Campaign completed',
    });
    return;
  }

  // Skip delay-only steps (acts as a wait node)
  if (step.channel === 'delay') {
    await scheduleNextStep(campaignLeadId, nextStepNumber, step.delayDays, step.delayHours);
    return;
  }

  // Generate the message
  let subject = step.subjectTemplate ?? '';
  let bodyText = step.bodyTemplate;

  if (step.aiPersonalizationEnabled && campaign.assignedAgentId) {
    try {
      const draft = await generateMessageDraft({
        agentId: campaign.assignedAgentId,
        contactId: cl.contactId,
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
        stepId: step.id,
      });
      if (draft.subject) subject = draft.subject;
      bodyText = draft.bodyText;
    } catch (err) {
      logger.error({ err, campaignLeadId }, 'AI personalization failed — using raw template');
    }
  }

  // Create queued message
  const [msg] = await db
    .insert(messages)
    .values({
      organizationId: campaign.organizationId,
      campaignLeadId: cl.id,
      contactId: cl.contactId,
      agentId: campaign.assignedAgentId ?? null,
      channel: step.channel === 'email' ? 'email' : 'linkedin',
      direction: 'outbound',
      subject,
      bodyText,
      aiGenerated: step.aiPersonalizationEnabled ?? false,
      status: 'queued',
      templateUsed: step.id,
    })
    .returning();

  if (msg) {
    await sendQueue.add('send_email', { messageId: msg.id });
  }

  // Advance pointer and schedule next step
  await db
    .update(campaignLeads)
    .set({
      currentStep: nextStepNumber,
      status: 'active',
      lastStepExecutedAt: new Date(),
      interactionCount: cl.interactionCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(campaignLeads.id, campaignLeadId));

  await scheduleNextStep(campaignLeadId, nextStepNumber, step.delayDays, step.delayHours);
}

async function scheduleNextStep(
  campaignLeadId: string,
  justExecutedStep: number,
  _delayDays: number,
  _delayHours: number,
) {
  const [cl] = await db
    .select()
    .from(campaignLeads)
    .where(eq(campaignLeads.id, campaignLeadId))
    .limit(1);
  if (!cl) return;

  const [nextStep] = await db
    .select()
    .from(cadenceSteps)
    .where(
      and(
        eq(cadenceSteps.campaignId, cl.campaignId),
        eq(cadenceSteps.stepNumber, justExecutedStep + 1),
      ),
    )
    .limit(1);

  if (!nextStep) {
    await db
      .update(campaignLeads)
      .set({ nextStepScheduledAt: null, updatedAt: new Date() })
      .where(eq(campaignLeads.id, campaignLeadId));
    return;
  }

  const delayMs =
    nextStep.delayDays * 24 * 60 * 60 * 1000 + nextStep.delayHours * 60 * 60 * 1000;
  const next = new Date(Date.now() + delayMs);

  await db
    .update(campaignLeads)
    .set({ nextStepScheduledAt: next, updatedAt: new Date() })
    .where(eq(campaignLeads.id, campaignLeadId));
}
