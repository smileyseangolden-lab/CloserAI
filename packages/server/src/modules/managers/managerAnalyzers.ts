/**
 * The three manager-role analyzers.
 *
 * Each one:
 *  - loads a tight slice of state its role cares about,
 *  - calls Claude with the role's system prompt + evidence,
 *  - writes findings into the existing artifact tables
 *    (optimization_proposals, knowledge_base, activities)
 *    so the rest of the platform reacts to them automatically,
 *  - produces a markdown digest persisted to manager_digests.
 *
 * Analyzers are side-effectful but idempotent in the sense that they
 * check the dedupe windows already used by the Optimization Scheduler
 * before inserting proposals, so repeated runs don't spam.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  activities,
  agentProfiles,
  businessProfiles,
  knowledgeBase,
  managerAgents,
  managerDigests,
  messages,
  opportunities,
  optimizationProposals,
  pilotReviews,
  pilotRuns,
} from '../../db/schema.js';
import { claude, claudeJson } from '../ai/anthropic.js';
import { embedAndStoreKnowledgeEntry } from '../ai/orgKnowledge.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../admin/settingsService.js';
import { MANAGER_BLUEPRINTS, nextRunAtFor, type ManagerRole } from './managerBlueprints.js';

export interface RunResult {
  digestId: string;
  proposalsCreated: number;
  knowledgeCreated: number;
  summary: string;
}

/** Entry point — dispatches to the role-specific analyzer. */
export async function runManager(managerAgentId: string): Promise<RunResult | null> {
  const [mgr] = await db
    .select()
    .from(managerAgents)
    .where(eq(managerAgents.id, managerAgentId))
    .limit(1);
  if (!mgr) return null;
  if (!mgr.isActive) return null;

  // Require an Anthropic key to do real work.
  try {
    const c = await resolveProviderConfig(mgr.organizationId, 'anthropic');
    if (!c.values.apiKey) {
      logger.info(
        { managerAgentId: mgr.id, orgId: mgr.organizationId },
        'Manager skipped — no Anthropic key',
      );
      return null;
    }
  } catch {
    return null;
  }

  let result: RunResult;
  try {
    switch (mgr.role) {
      case 'sales_manager':
        result = await runSalesManager(mgr);
        break;
      case 'marketing_manager':
        result = await runMarketingManager(mgr);
        break;
      case 'cro':
        result = await runCRO(mgr);
        break;
      default:
        throw new Error(`Unknown manager role ${mgr.role}`);
    }
  } catch (err) {
    logger.error({ err, managerAgentId: mgr.id }, 'Manager run failed');
    await db
      .update(managerAgents)
      .set({
        lastRunAt: new Date(),
        lastRunSummary: `Error: ${err instanceof Error ? err.message : String(err)}`,
        nextRunAt: nextRunAtFor(mgr.cadence),
        updatedAt: new Date(),
      })
      .where(eq(managerAgents.id, mgr.id));
    return null;
  }

  await db
    .update(managerAgents)
    .set({
      lastRunAt: new Date(),
      lastRunSummary: result.summary.slice(0, 500),
      nextRunAt: nextRunAtFor(mgr.cadence),
      updatedAt: new Date(),
    })
    .where(eq(managerAgents.id, mgr.id));
  return result;
}

// =====================================================================
// Sales Manager
// =====================================================================

async function runSalesManager(mgr: typeof managerAgents.$inferSelect): Promise<RunResult> {
  const orgId = mgr.organizationId;
  const sinceHour = new Date(Date.now() - 60 * 60 * 1000);
  const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stalledThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Evidence 1: opportunities with no stage change in >14d (stalled).
  const stalledOpps = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      stageChangedAt: opportunities.stageChangedAt,
      assignedAgentId: opportunities.assignedAgentId,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.organizationId, orgId),
        isNull(opportunities.deletedAt),
        sql`${opportunities.stage} not in ('closed_won','closed_lost')`,
        sql`${opportunities.stageChangedAt} < ${stalledThreshold}`,
      ),
    )
    .limit(25);

  // Evidence 2: recent pilot reviews that flagged off_brand / non_compliant
  // so we can cluster by agent and propose prompt tweaks.
  const flaggedReviews = await db
    .select({
      id: pilotReviews.id,
      agentId: pilotReviews.agentId,
      verdict: pilotReviews.verdict,
      issues: pilotReviews.issues,
      reasoning: pilotReviews.reasoning,
      createdAt: pilotReviews.createdAt,
      bodyText: pilotReviews.bodyText,
    })
    .from(pilotReviews)
    .innerJoin(pilotRuns, eq(pilotReviews.pilotRunId, pilotRuns.id))
    .where(
      and(
        eq(pilotRuns.organizationId, orgId),
        gte(pilotReviews.createdAt, sinceWeek),
        sql`${pilotReviews.verdict} <> 'ok'`,
      ),
    )
    .limit(50);

  // Evidence 3: per-agent metrics over the last hour (for hourly cadence).
  const hourlyPerAgent = await db
    .select({
      agentId: messages.agentId,
      sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')`,
      bounced: sql<number>`count(*) filter (where ${messages.bouncedAt} is not null)`,
      replied: sql<number>`count(*) filter (where ${messages.repliedAt} is not null)`,
    })
    .from(messages)
    .where(and(eq(messages.organizationId, orgId), gte(messages.createdAt, sinceHour)))
    .groupBy(messages.agentId);

  const agents = await db
    .select({ id: agentProfiles.id, name: agentProfiles.name })
    .from(agentProfiles)
    .where(and(eq(agentProfiles.organizationId, orgId), isNull(agentProfiles.deletedAt)));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const evidence = {
    stalledOpportunities: stalledOpps.map((o) => ({
      id: o.id,
      title: o.title,
      stage: o.stage,
      daysStalled: Math.floor(
        (Date.now() - (o.stageChangedAt?.getTime() ?? Date.now())) / (24 * 60 * 60 * 1000),
      ),
      value: o.estimatedValue,
      agent: o.assignedAgentId ? agentById.get(o.assignedAgentId)?.name ?? null : null,
      agentId: o.assignedAgentId ?? null,
    })),
    flaggedReviews: flaggedReviews.map((r) => ({
      agent: r.agentId ? agentById.get(r.agentId)?.name ?? null : null,
      agentId: r.agentId ?? null,
      verdict: r.verdict,
      issues: r.issues,
      sampleText: (r.bodyText ?? '').slice(0, 300),
    })),
    hourlyAgentMetrics: hourlyPerAgent
      .filter((r) => r.agentId)
      .map((r) => ({
        agentId: r.agentId,
        agent: agentById.get(r.agentId as string)?.name ?? null,
        sent: Number(r.sent),
        replied: Number(r.replied),
        bounced: Number(r.bounced),
      })),
  };

  if (
    evidence.stalledOpportunities.length === 0 &&
    evidence.flaggedReviews.length === 0 &&
    evidence.hourlyAgentMetrics.length === 0
  ) {
    const digest = await saveDigest(mgr, {
      content: '## Sales Manager · all clear\n\nNo stalled deals, no flagged reviews, no anomalies in the last hour. Team is healthy.',
      summary: 'All clear — no interventions needed.',
      metrics: { stalledOpps: 0, flaggedReviews: 0 },
      proposalsCreated: 0,
      knowledgeCreated: 0,
    });
    return {
      digestId: digest.id,
      proposalsCreated: 0,
      knowledgeCreated: 0,
      summary: 'All clear — no interventions needed.',
    };
  }

  const prompt = `${mgr.systemPromptOverride ?? MANAGER_BLUEPRINTS.sales_manager.systemPrompt}

Evidence from the last hour / week:
${JSON.stringify(evidence, null, 2)}

Your output must be strict JSON with this shape:
{
  "digest": "<markdown brief, 150-350 words, 1 TL;DR + 3-5 specific observations with ids>",
  "coachingNotes": [
    {
      "opportunityId": "<uuid of a stalled opportunity>",
      "note": "<1-3 sentences the assigned rep / agent should act on>"
    }
  ],
  "proposals": [
    {
      "proposalType": "agent_prompt_change",
      "targetResourceId": "<agentId>",
      "title": "<short imperative>",
      "description": "<concrete change>",
      "rationale": "<tie to evidence>",
      "expectedImpact": "<e.g. +0.3pp reply rate>",
      "afterValue": { "toneDescription": "<new tone>" }
    }
  ]
}
Proposals must only reference agentIds that appear in the evidence. Do not invent ids. Keep total proposals ≤3.`;

  interface SMPayload {
    digest: string;
    coachingNotes?: Array<{ opportunityId: string; note: string }>;
    proposals?: Array<{
      proposalType: string;
      targetResourceId?: string;
      title: string;
      description: string;
      rationale?: string;
      expectedImpact?: string;
      afterValue?: Record<string, unknown>;
    }>;
  }
  const payload = await claudeJson<SMPayload>(prompt, {
    orgId,
    maxTokens: 3000,
    temperature: 0.3,
  });

  let proposalsCreated = 0;
  for (const p of payload.proposals ?? []) {
    if (p.proposalType !== 'agent_prompt_change') continue;
    if (!p.targetResourceId || !p.title || !p.description) continue;
    if (await isDuplicateProposal(orgId, p.proposalType, p.targetResourceId, p.title)) continue;
    await db.insert(optimizationProposals).values({
      organizationId: orgId,
      proposalType: 'agent_prompt_change',
      targetResourceType: 'agent',
      targetResourceId: p.targetResourceId,
      title: p.title,
      description: p.description,
      rationale: p.rationale ?? `Sales Manager — ${mgr.name}`,
      expectedImpact: p.expectedImpact,
      afterValue: p.afterValue ?? null,
      status: 'pending',
    });
    proposalsCreated++;
  }

  // Persist coaching notes as activities so they show up on the lead timeline.
  const knownOppIds = new Set(evidence.stalledOpportunities.map((o) => o.id));
  for (const note of payload.coachingNotes ?? []) {
    if (!knownOppIds.has(note.opportunityId)) continue;
    const [opp] = await db
      .select({ leadId: opportunities.leadId, agentId: opportunities.assignedAgentId })
      .from(opportunities)
      .where(eq(opportunities.id, note.opportunityId))
      .limit(1);
    if (!opp) continue;
    await db.insert(activities).values({
      organizationId: orgId,
      leadId: opp.leadId,
      agentId: opp.agentId,
      activityType: 'note_added',
      description: `[Sales Manager] ${note.note}`,
      metadata: { source: 'sales_manager', managerAgentId: mgr.id },
    });
  }

  const digest = await saveDigest(mgr, {
    content: payload.digest,
    summary: firstLine(payload.digest),
    metrics: {
      stalledOpps: evidence.stalledOpportunities.length,
      flaggedReviews: evidence.flaggedReviews.length,
      coachingNotes: payload.coachingNotes?.length ?? 0,
    },
    proposalsCreated,
    knowledgeCreated: 0,
  });

  return {
    digestId: digest.id,
    proposalsCreated,
    knowledgeCreated: 0,
    summary: firstLine(payload.digest),
  };
}

// =====================================================================
// Marketing Manager
// =====================================================================

async function runMarketingManager(
  mgr: typeof managerAgents.$inferSelect,
): Promise<RunResult> {
  const orgId = mgr.organizationId;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Inbound objections that might lack playbooks.
  const inboundObjections = await db
    .select({
      id: messages.id,
      bodyText: messages.bodyText,
      intentClassification: messages.intentClassification,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, orgId),
        eq(messages.direction, 'inbound'),
        gte(messages.createdAt, since),
        sql`${messages.intentClassification} in ('objection','more_info','not_interested')`,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(40);

  // Flagged reviews — brand-voice drift signal.
  const brandDrift = await db
    .select({
      agentId: pilotReviews.agentId,
      verdict: pilotReviews.verdict,
      issues: pilotReviews.issues,
      reasoning: pilotReviews.reasoning,
    })
    .from(pilotReviews)
    .innerJoin(pilotRuns, eq(pilotReviews.pilotRunId, pilotRuns.id))
    .where(
      and(
        eq(pilotRuns.organizationId, orgId),
        gte(pilotReviews.createdAt, since),
        eq(pilotReviews.verdict, 'off_brand'),
      ),
    )
    .limit(30);

  // Existing knowledge footprint — count only.
  const [{ kbCount }] = await db
    .select({ kbCount: sql<number>`count(*)` })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.organizationId, orgId));

  if (inboundObjections.length === 0 && brandDrift.length === 0) {
    const digest = await saveDigest(mgr, {
      content:
        '## Marketing Manager · all clear\n\nNo unhandled objection patterns in the last 7 days and no brand-voice drift flagged. Knowledge base footprint stable.',
      summary: 'No content gaps surfaced.',
      metrics: { inboundObjections: 0, brandDrift: 0 },
      proposalsCreated: 0,
      knowledgeCreated: 0,
    });
    return {
      digestId: digest.id,
      proposalsCreated: 0,
      knowledgeCreated: 0,
      summary: 'No content gaps surfaced.',
    };
  }

  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, orgId))
    .limit(1);

  const prompt = `${mgr.systemPromptOverride ?? MANAGER_BLUEPRINTS.marketing_manager.systemPrompt}

Company: ${JSON.stringify(profile ?? {}).slice(0, 1000)}
Existing knowledge entries: ${Number(kbCount ?? 0)}

Recent inbound objections / info-requests (last 7d):
${inboundObjections
  .map((m, i) => `${i + 1}. [${m.intentClassification}] ${m.bodyText.slice(0, 250)}`)
  .join('\n')}

Brand-voice drift samples: ${JSON.stringify(brandDrift.slice(0, 10), null, 2)}

Your output must be strict JSON:
{
  "digest": "<markdown, 150-350 words. 1 TL;DR + 3-5 recurring themes>",
  "newKnowledge": [
    {
      "source": "objection_playbook" | "battlecard" | "faq",
      "title": "<short>",
      "content": "<120-250 words: validation → reframe → proof → close>",
      "tags": ["from-marketing-manager"]
    }
  ],
  "proposals": [
    {
      "proposalType": "value_prop_change" | "cadence_change",
      "title": "<imperative>",
      "description": "<specific change>",
      "rationale": "<tie to evidence>",
      "expectedImpact": "<e.g. fewer ‘too expensive’ objections>"
    }
  ]
}
Keep newKnowledge ≤ 5 and proposals ≤ 3. Do not duplicate content that would already exist in a 120-entry knowledge base — be specific to the patterns above.`;

  interface MMPayload {
    digest: string;
    newKnowledge?: Array<{
      source: 'objection_playbook' | 'battlecard' | 'faq';
      title: string;
      content: string;
      tags?: string[];
    }>;
    proposals?: Array<{
      proposalType: string;
      title: string;
      description: string;
      rationale?: string;
      expectedImpact?: string;
    }>;
  }
  const payload = await claudeJson<MMPayload>(prompt, {
    orgId,
    maxTokens: 3500,
    temperature: 0.3,
  });

  let knowledgeCreated = 0;
  for (const k of payload.newKnowledge ?? []) {
    if (!k.title || !k.content) continue;
    await embedAndStoreKnowledgeEntry({
      organizationId: orgId,
      source: k.source,
      title: k.title,
      content: k.content,
      tags: [...(k.tags ?? []), 'from-marketing-manager'],
    });
    knowledgeCreated++;
  }

  let proposalsCreated = 0;
  for (const p of payload.proposals ?? []) {
    if (!['value_prop_change', 'cadence_change'].includes(p.proposalType)) continue;
    if (!p.title || !p.description) continue;
    if (await isDuplicateProposal(orgId, p.proposalType, null, p.title)) continue;
    await db.insert(optimizationProposals).values({
      organizationId: orgId,
      proposalType: p.proposalType as 'value_prop_change' | 'cadence_change',
      targetResourceType: p.proposalType === 'value_prop_change' ? 'value_prop' : 'cadence',
      title: p.title,
      description: p.description,
      rationale: p.rationale ?? `Marketing Manager — ${mgr.name}`,
      expectedImpact: p.expectedImpact,
      status: 'pending',
    });
    proposalsCreated++;
  }

  const digest = await saveDigest(mgr, {
    content: payload.digest,
    summary: firstLine(payload.digest),
    metrics: {
      inboundObjections: inboundObjections.length,
      brandDrift: brandDrift.length,
    },
    proposalsCreated,
    knowledgeCreated,
  });

  return {
    digestId: digest.id,
    proposalsCreated,
    knowledgeCreated,
    summary: firstLine(payload.digest),
  };
}

// =====================================================================
// CRO
// =====================================================================

async function runCRO(mgr: typeof managerAgents.$inferSelect): Promise<RunResult> {
  const orgId = mgr.organizationId;
  const sinceMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Recent digests from the other two managers.
  const otherManagers = await db
    .select({ id: managerAgents.id, role: managerAgents.role })
    .from(managerAgents)
    .where(
      and(
        eq(managerAgents.organizationId, orgId),
        inArray(managerAgents.role, ['sales_manager', 'marketing_manager']),
      ),
    );
  const recentDigests = await db
    .select()
    .from(managerDigests)
    .where(
      and(
        eq(managerDigests.organizationId, orgId),
        gte(managerDigests.createdAt, sinceWeek),
        inArray(
          managerDigests.managerAgentId,
          otherManagers.map((m) => m.id),
        ),
      ),
    )
    .orderBy(desc(managerDigests.createdAt))
    .limit(20);

  // Win/loss patterns.
  const recentClosed = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stage: opportunities.stage,
      estimatedValue: opportunities.estimatedValue,
      closeReason: opportunities.closeReason,
      lossReason: opportunities.lossReason,
      actualCloseDate: opportunities.actualCloseDate,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.organizationId, orgId),
        isNull(opportunities.deletedAt),
        inArray(opportunities.stage, ['closed_won', 'closed_lost']),
        sql`${opportunities.updatedAt} >= ${sinceMonth}`,
      ),
    )
    .limit(50);

  // Current proposal queue depth.
  const proposalCounts = await db
    .select({
      status: optimizationProposals.status,
      count: sql<number>`count(*)`,
    })
    .from(optimizationProposals)
    .where(eq(optimizationProposals.organizationId, orgId))
    .groupBy(optimizationProposals.status);

  const prompt = `${mgr.systemPromptOverride ?? MANAGER_BLUEPRINTS.cro.systemPrompt}

This is your weekly executive review. Here is the evidence:

Recent Sales Manager + Marketing Manager digests (last 7 days):
${recentDigests
  .map((d, i) => `--- ${i + 1}. ${d.role} @ ${d.createdAt.toISOString()} ---\n${d.content.slice(0, 1500)}`)
  .join('\n\n')}

Closed deals in the last 30 days:
${JSON.stringify(recentClosed, null, 2)}

Optimization proposal queue:
${JSON.stringify(proposalCounts, null, 2)}

Produce a JSON response:
{
  "digest": "<markdown, 300-600 words. Start with TL;DR. Then: 1) Top 3-5 priority actions; 2) ICP drift observations based on win/loss patterns; 3) Brand / positioning gaps>",
  "summary": "<one-sentence pipeline-health call>",
  "topPriorityTitles": ["<title of the single highest-value action>", "..."]
}`;

  const payload = await claudeJson<{
    digest: string;
    summary: string;
    topPriorityTitles?: string[];
  }>(prompt, {
    orgId,
    maxTokens: 4000,
    temperature: 0.3,
    // CRO deserves Opus-class reasoning. assistantEngine routes by stage;
    // here we rely on the org's default model, which should be Opus for
    // complex reasoning per the brief.
  });

  const digest = await saveDigest(mgr, {
    content: payload.digest,
    summary: payload.summary ?? firstLine(payload.digest),
    metrics: {
      digestsRead: recentDigests.length,
      closedDeals: recentClosed.length,
      openProposals:
        proposalCounts.find((p) => p.status === 'pending')?.count ?? 0,
    },
    proposalsCreated: 0,
    knowledgeCreated: 0,
  });

  // Unused import suppression: reference claude & managerDigests to keep linters quiet.
  void claude;

  return {
    digestId: digest.id,
    proposalsCreated: 0,
    knowledgeCreated: 0,
    summary: payload.summary ?? firstLine(payload.digest),
  };
}

// =====================================================================
// helpers
// =====================================================================

async function saveDigest(
  mgr: typeof managerAgents.$inferSelect,
  input: {
    content: string;
    summary: string;
    metrics: Record<string, unknown>;
    proposalsCreated: number;
    knowledgeCreated: number;
  },
) {
  const [row] = await db
    .insert(managerDigests)
    .values({
      managerAgentId: mgr.id,
      organizationId: mgr.organizationId,
      role: mgr.role as ManagerRole,
      cadence: mgr.cadence,
      content: input.content,
      summary: input.summary.slice(0, 500),
      metrics: input.metrics,
      proposalsCreated: input.proposalsCreated,
      knowledgeCreated: input.knowledgeCreated,
    })
    .returning();
  return row!;
}

async function isDuplicateProposal(
  orgId: string,
  proposalType: string,
  targetResourceId: string | null,
  title: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: optimizationProposals.id })
    .from(optimizationProposals)
    .where(
      and(
        eq(optimizationProposals.organizationId, orgId),
        eq(optimizationProposals.proposalType, proposalType as
          | 'agent_prompt_change'
          | 'knowledge_add'
          | 'knowledge_edit'
          | 'icp_targeting_change'
          | 'cadence_change'
          | 'value_prop_change'
          | 'data_source_change'),
        gte(optimizationProposals.createdAt, since),
        targetResourceId
          ? eq(optimizationProposals.targetResourceId, targetResourceId)
          : sql`${optimizationProposals.targetResourceId} is null`,
        sql`lower(${optimizationProposals.title}) = ${title.toLowerCase()}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function firstLine(md: string): string {
  const firstPara = md.replace(/^#+\s*/gm, '').trim().split(/\n\s*\n/)[0] ?? '';
  const sentence = firstPara.split(/(?<=[.!?])\s/)[0] ?? firstPara;
  return sentence.slice(0, 280);
}
