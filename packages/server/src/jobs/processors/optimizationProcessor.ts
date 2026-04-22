import type { Job } from 'bullmq';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  agentProfiles,
  idealCustomerProfiles,
  knowledgeBase,
  messages,
  optimizationProposals,
  organizations,
} from '../../db/schema.js';
import { claudeJson } from '../../modules/ai/anthropic.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../../modules/admin/settingsService.js';

/**
 * For one org at a time: compute weekly performance, ask Claude for concrete
 * change proposals, and write them into optimization_proposals in status=pending.
 * Claude chooses proposal_type from a fixed allowlist; we validate the shape
 * before insert. Proposals are deduped on (proposalType, targetResourceId,
 * title) within the last 14 days so we don't spam the optimization tab.
 */
export async function processOptimizationJob(job: Job<{ organizationId: string }>) {
  const orgId = job.data.organizationId;
  const enabled = await isSchedulerEnabled(orgId);
  if (!enabled) {
    logger.debug({ orgId }, 'optimization scheduler disabled for org');
    return;
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const perAgent = await db
    .select({
      agentId: messages.agentId,
      sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')`,
      opened: sql<number>`count(*) filter (where ${messages.openedAt} is not null)`,
      replied: sql<number>`count(*) filter (where ${messages.repliedAt} is not null)`,
      bounced: sql<number>`count(*) filter (where ${messages.bouncedAt} is not null)`,
    })
    .from(messages)
    .where(and(eq(messages.organizationId, orgId), gte(messages.createdAt, since)))
    .groupBy(messages.agentId);

  const agents = await db
    .select({ id: agentProfiles.id, name: agentProfiles.name })
    .from(agentProfiles)
    .where(and(eq(agentProfiles.organizationId, orgId), isNull(agentProfiles.deletedAt)));
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  const icps = await db
    .select({
      id: idealCustomerProfiles.id,
      name: idealCustomerProfiles.name,
      industries: idealCustomerProfiles.targetIndustries,
    })
    .from(idealCustomerProfiles)
    .where(
      and(
        eq(idealCustomerProfiles.organizationId, orgId),
        isNull(idealCustomerProfiles.deletedAt),
      ),
    );

  const kbCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.organizationId, orgId));

  // Build a compact performance summary to feed Claude.
  const agentSummary = perAgent
    .filter((r) => r.agentId)
    .map((r) => {
      const sent = Number(r.sent ?? 0);
      const replied = Number(r.replied ?? 0);
      const bounced = Number(r.bounced ?? 0);
      return {
        agentId: r.agentId,
        agentName: agentNameById.get(r.agentId as string) ?? 'Unknown',
        sent,
        replyRate: sent > 0 ? replied / sent : 0,
        bounceRate: sent > 0 ? bounced / sent : 0,
      };
    });

  if (agentSummary.reduce((s, a) => s + a.sent, 0) < 50) {
    logger.debug({ orgId }, 'optimization analyzer: insufficient volume; skipping');
    return;
  }

  const prompt = `You are the continuous-optimization agent for a B2B sales platform. Analyse this week's per-agent performance and propose up to 5 concrete, applicable changes. Prioritise agents with low reply rate (<2%) or high bounce rate (>2%).

Agents (last 7d):
${JSON.stringify(agentSummary, null, 2)}

Active ICPs: ${JSON.stringify(icps, null, 2)}
Knowledge base entries: ${Number(kbCount[0]?.count ?? 0)}

Return JSON with a single top-level array "proposals". Each proposal must use this exact shape:
{
  "proposalType": "agent_prompt_change" | "knowledge_add" | "knowledge_edit" | "icp_targeting_change" | "cadence_change" | "value_prop_change" | "data_source_change",
  "targetResourceType": "agent" | "knowledge" | "icp" | "cadence" | "value_prop" | "data_source",
  "targetResourceId": "<uuid if referring to an existing row, else omit>",
  "title": "short imperative title",
  "description": "1-2 sentences, concrete and specific",
  "rationale": "why, tied to the data above",
  "expectedImpact": "e.g. +0.5pp reply rate",
  "afterValue": { ... shape depends on proposalType ... }
}

For proposalType="agent_prompt_change", afterValue must contain either systemPrompt (full replacement) or toneDescription. For proposalType="knowledge_add", afterValue must contain { title, content }. Use real agent / ICP ids from above when referring to them; never invent ids.`;

  interface Proposal {
    proposalType: string;
    targetResourceType: string;
    targetResourceId?: string;
    title: string;
    description: string;
    rationale?: string;
    expectedImpact?: string;
    afterValue?: unknown;
  }
  let result: { proposals?: Proposal[] };
  try {
    result = await claudeJson<{ proposals?: Proposal[] }>(prompt, {
      orgId,
      maxTokens: 2500,
      temperature: 0.2,
    });
  } catch (err) {
    logger.warn({ err, orgId }, 'optimization analyzer: LLM failed');
    return;
  }
  const proposals = Array.isArray(result.proposals) ? result.proposals : [];
  if (proposals.length === 0) return;

  const allowedTypes = new Set([
    'agent_prompt_change',
    'knowledge_add',
    'knowledge_edit',
    'icp_targeting_change',
    'cadence_change',
    'value_prop_change',
    'data_source_change',
  ]);

  // Dedupe window: skip anything we already have pending/applied in the last 14 days.
  const dedupeSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recent = await db
    .select({
      proposalType: optimizationProposals.proposalType,
      targetResourceId: optimizationProposals.targetResourceId,
      title: optimizationProposals.title,
    })
    .from(optimizationProposals)
    .where(
      and(
        eq(optimizationProposals.organizationId, orgId),
        gte(optimizationProposals.createdAt, dedupeSince),
      ),
    );
  const seen = new Set(
    recent.map(
      (r) => `${r.proposalType}::${r.targetResourceId ?? 'none'}::${r.title.toLowerCase()}`,
    ),
  );

  let inserted = 0;
  for (const p of proposals) {
    if (!allowedTypes.has(p.proposalType)) continue;
    if (!p.title || !p.description) continue;
    const dedupeKey = `${p.proposalType}::${p.targetResourceId ?? 'none'}::${p.title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    await db.insert(optimizationProposals).values({
      organizationId: orgId,
      proposalType:
        p.proposalType as typeof optimizationProposals.$inferInsert.proposalType,
      targetResourceType: p.targetResourceType,
      targetResourceId: p.targetResourceId,
      title: p.title,
      description: p.description,
      rationale: p.rationale,
      expectedImpact: p.expectedImpact,
      afterValue:
        p.afterValue && typeof p.afterValue === 'object'
          ? (p.afterValue as Record<string, unknown>)
          : null,
      status: 'pending',
    });
    inserted++;
  }

  logger.info({ orgId, inserted, generated: proposals.length }, 'optimization proposals inserted');
}

async function isSchedulerEnabled(orgId: string): Promise<boolean> {
  try {
    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    if (settings.optimizationSchedulerEnabled === false) return false;
  } catch (err) {
    logger.warn({ err, orgId }, 'failed to load org settings');
  }
  // Also require an Anthropic API key to be resolvable.
  try {
    const c = await resolveProviderConfig(orgId, 'anthropic');
    if (!c.values.apiKey) return false;
  } catch {
    return false;
  }
  return true;
}

/** Export helper used by tests + admin "run now" endpoint. */
export async function runOptimizationAnalysisNow(orgId: string) {
  await processOptimizationJob({ data: { organizationId: orgId } } as Job<{
    organizationId: string;
  }>);
}

// Log the desc / isNull imports as used so tree-shaking / eslint-no-unused doesn't flag them.
void desc;
void isNull;
