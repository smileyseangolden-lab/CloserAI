/**
 * Propagates an approved workspace_stages draft into the canonical domain
 * tables. Every stage owns a pure function (orgId, draft, user) => void that
 * mirrors the draft fields into their authoritative schema, so downstream
 * stages (and the rest of the app) can read typed rows instead of reaching
 * into JSON.
 *
 * Upsert semantics: idempotent. Re-approving a stage replaces its
 * downstream-owned rows. Rows that depend on earlier stages (e.g. value_props
 * referencing icp tier ids) resolve those references at propagation time.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  agentProfiles,
  businessProfiles,
  competitiveMatrix,
  complianceRules,
  dataSources,
  deployments,
  escalationPaths,
  handoffRules,
  idealCustomerProfiles,
  pricingTiers,
  valueProps,
} from '../../db/schema.js';
import { logger } from '../../utils/logger.js';
import { embedAndStoreKnowledgeEntry } from '../ai/orgKnowledge.js';

export interface ApprovalContext {
  organizationId: string;
  userId?: string | null;
  draft: Record<string, unknown>;
}

type Propagator = (ctx: ApprovalContext) => Promise<void>;

const PROPAGATORS: Record<string, Propagator> = {
  'company-profile': propagateCompanyProfile,
  'data-sources': propagateDataSources,
  'agent-builder': propagateAgentBuilder,
  icp: propagateIcp,
  'value-prop': propagateValueProp,
  knowledge: propagateKnowledge,
  deployment: propagateDeployment,
  pilot: noop,
  handoff: propagateHandoff,
  analytics: noop,
  optimization: noop,
};

export async function propagateApprovedStage(
  stageId: string,
  ctx: ApprovalContext,
): Promise<void> {
  const fn = PROPAGATORS[stageId];
  if (!fn) return;
  try {
    await fn(ctx);
  } catch (err) {
    logger.error({ err, stageId, organizationId: ctx.organizationId }, 'stage propagation failed');
    // Intentionally swallow — approval already recorded; propagation is
    // recoverable via re-approve and must not wedge the UX.
  }
}

async function noop(): Promise<void> {
  return;
}

// ---------------------------------------------------------------------------
// Stage 1: Company Profile → business_profiles
// ---------------------------------------------------------------------------

async function propagateCompanyProfile({ organizationId, draft }: ApprovalContext) {
  const companyName = pickString(draft, 'companyName') ?? 'Untitled company';
  const patch = {
    companyName,
    industry: pickString(draft, 'industry'),
    subIndustry: pickString(draft, 'subIndustry'),
    website: pickString(draft, 'website'),
    valueProposition:
      pickString(draft, 'valueProposition') ?? pickString(draft, 'mission') ?? null,
    keyDifferentiators: pickStringArray(draft, 'keyDifferentiators') ?? undefined,
    targetVerticals: pickStringArray(draft, 'targetVerticals') ?? undefined,
    painPointsSolved: pickStringArray(draft, 'painPointsSolved') ?? undefined,
    aiGeneratedSummary:
      pickString(draft, 'companySummary') ?? pickString(draft, 'mission') ?? null,
    annualRevenueRange: pickString(draft, 'revenueBand') ?? pickString(draft, 'annualRevenueRange'),
  };

  const [existing] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, organizationId))
    .limit(1);

  if (existing) {
    await db
      .update(businessProfiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(businessProfiles.id, existing.id));
  } else {
    await db.insert(businessProfiles).values({ ...patch, organizationId });
  }
}

// ---------------------------------------------------------------------------
// Stage 2: Data Sources → data_sources
// ---------------------------------------------------------------------------

async function propagateDataSources({ organizationId, draft }: ApprovalContext) {
  const providers = pickArray<Record<string, unknown>>(draft, 'recommendedProviders');
  if (!providers || providers.length === 0) return;

  await db.delete(dataSources).where(eq(dataSources.organizationId, organizationId));

  for (const p of providers) {
    const providerKey = pickString(p, 'key') ?? pickString(p, 'providerKey');
    if (!providerKey) continue;
    await db.insert(dataSources).values({
      organizationId,
      providerKey,
      providerName: pickString(p, 'name') ?? providerKey,
      category: pickString(p, 'category') ?? 'enrichment',
      tier: (pickString(p, 'tier') as 'starter' | 'scale' | 'enterprise') ?? 'starter',
      status:
        (pickString(p, 'status') as 'recommended' | 'connected' | 'skipped' | 'error') ??
        'recommended',
      estimatedMonthlyCostUsd: pickDecimal(p, 'estimatedMonthlyCostUsd'),
      monthlyBudgetUsd: pickDecimal(draft, 'monthlyBudgetUsd'),
      reasoning: pickString(p, 'reasoning'),
      enrichmentRules: (p.enrichmentRules as object) ?? {},
    });
  }
}

// ---------------------------------------------------------------------------
// Stage 3: Agent Builder → agent_profiles (upsert-by-name)
// ---------------------------------------------------------------------------

async function propagateAgentBuilder({ organizationId, draft }: ApprovalContext) {
  const agents = pickArray<Record<string, unknown>>(draft, 'agents');
  if (!agents || agents.length === 0) return;

  for (const a of agents) {
    const name = pickString(a, 'name');
    if (!name) continue;

    const patch = {
      name,
      agentType:
        (pickString(a, 'agentType') as 'prospector' | 'nurturer' | 'closer' | 'hybrid') ??
        'prospector',
      personalityStyle:
        (pickString(a, 'personalityStyle') as
          | 'technical'
          | 'consultative'
          | 'social_friendly'
          | 'executive'
          | 'challenger'
          | 'educational') ?? 'consultative',
      toneDescription: pickString(a, 'toneDescription'),
      systemPromptOverride: pickString(a, 'systemPrompt'),
      senderName: pickString(a, 'senderName') ?? name,
      senderTitle: pickString(a, 'senderTitle'),
      emailSignature: pickString(a, 'emailSignature'),
      linkedinBio: pickString(a, 'linkedinBio'),
      isActive: pickBoolean(a, 'isActive') ?? true,
    };

    const [existing] = await db
      .select()
      .from(agentProfiles)
      .where(and(eq(agentProfiles.organizationId, organizationId), eq(agentProfiles.name, name)))
      .limit(1);

    if (existing) {
      await db
        .update(agentProfiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(agentProfiles.id, existing.id));
    } else {
      await db.insert(agentProfiles).values({ ...patch, organizationId });
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 4: ICP → ideal_customer_profiles (one per tier A/B/C)
// ---------------------------------------------------------------------------

async function propagateIcp({ organizationId, draft }: ApprovalContext) {
  const tiers = pickArray<Record<string, unknown>>(draft, 'tiers');
  if (!tiers || tiers.length === 0) return;

  for (const t of tiers) {
    const name = pickString(t, 'name') ?? pickString(t, 'tier') ?? 'Untitled tier';
    const patch = {
      name,
      description: pickString(t, 'description'),
      targetIndustries: pickStringArray(t, 'targetIndustries') ?? undefined,
      targetCompanySizes: pickStringArray(t, 'targetCompanySizes') ?? undefined,
      targetRevenueRanges: pickStringArray(t, 'targetRevenueRanges') ?? undefined,
      targetJobTitles: pickStringArray(t, 'targetJobTitles') ?? undefined,
      targetDepartments: pickStringArray(t, 'targetDepartments') ?? undefined,
      targetGeographies: pickStringArray(t, 'targetGeographies') ?? undefined,
      buyingSignals:
        pickStringArray(t, 'buyingSignals') ??
        pickStringArray(draft, 'buyingSignals') ??
        undefined,
      disqualifiers:
        pickStringArray(t, 'disqualifiers') ??
        pickStringArray(draft, 'disqualifiers') ??
        undefined,
      priority: pickNumber(t, 'priority') ?? 0,
      isActive: true,
    };

    const [existing] = await db
      .select()
      .from(idealCustomerProfiles)
      .where(
        and(
          eq(idealCustomerProfiles.organizationId, organizationId),
          eq(idealCustomerProfiles.name, name),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(idealCustomerProfiles)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(idealCustomerProfiles.id, existing.id));
    } else {
      await db.insert(idealCustomerProfiles).values({ ...patch, organizationId });
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 5: Value Prop → value_props + pricing_tiers + competitive_matrix
// ---------------------------------------------------------------------------

async function propagateValueProp({ organizationId, draft }: ApprovalContext) {
  const variants = pickArray<Record<string, unknown>>(draft, 'pitchVariants');
  if (variants) {
    await db.delete(valueProps).where(eq(valueProps.organizationId, organizationId));
    for (const v of variants) {
      await db.insert(valueProps).values({
        organizationId,
        variant:
          (pickString(v, 'variant') as 'technical' | 'business_outcome' | 'emotional') ??
          'business_outcome',
        headline: pickString(v, 'headline') ?? 'Untitled pitch',
        body: pickString(v, 'body') ?? '',
        proofPoints: pickStringArray(v, 'proofPoints') ?? undefined,
        targetPersona: pickString(v, 'targetPersona'),
      });
    }
  }

  const pricing = pickArray<Record<string, unknown>>(draft, 'pricingTiers');
  if (pricing) {
    await db.delete(pricingTiers).where(eq(pricingTiers.organizationId, organizationId));
    let order = 0;
    for (const p of pricing) {
      await db.insert(pricingTiers).values({
        organizationId,
        name: pickString(p, 'name') ?? `Tier ${order + 1}`,
        description: pickString(p, 'description'),
        priceMonthly: pickDecimal(p, 'priceMonthly'),
        priceAnnual: pickDecimal(p, 'priceAnnual'),
        currency: pickString(p, 'currency') ?? 'USD',
        features: pickStringArray(p, 'features') ?? undefined,
        targetSegment: pickString(p, 'targetSegment'),
        sortOrder: order++,
      });
    }
  }

  const competitiveRaw = draft.competitiveMatrix;
  const competitiveRows = Array.isArray(competitiveRaw)
    ? (competitiveRaw as Record<string, unknown>[])
    : competitiveRaw && typeof competitiveRaw === 'object'
      ? Object.entries(competitiveRaw as Record<string, unknown>).map(([competitor, v]) => ({
          competitor,
          ...(v as Record<string, unknown>),
        }))
      : null;

  if (competitiveRows) {
    await db
      .delete(competitiveMatrix)
      .where(eq(competitiveMatrix.organizationId, organizationId));
    for (const row of competitiveRows) {
      const competitor = pickString(row, 'competitor');
      if (!competitor) continue;
      await db.insert(competitiveMatrix).values({
        organizationId,
        competitor,
        competitorUrl: pickString(row, 'competitorUrl'),
        ourStrengths: pickStringArray(row, 'ourStrengths') ?? undefined,
        theirStrengths: pickStringArray(row, 'theirStrengths') ?? undefined,
        differentiators:
          pickStringArray(row, 'differentiators') ??
          pickStringArray(draft, 'differentiators') ??
          undefined,
        pricingNotes: pickString(row, 'pricingNotes'),
        sourceUrls: pickStringArray(row, 'sourceUrls') ?? undefined,
        g2Rating: pickNumber(row, 'g2Rating') ?? undefined,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 6: Knowledge — ingest into knowledge_base with embedding
// ---------------------------------------------------------------------------

async function propagateKnowledge({ organizationId, draft }: ApprovalContext) {
  const buckets: Array<{
    key: string;
    source:
      | 'battlecard'
      | 'faq'
      | 'objection_playbook'
      | 'document'
      | 'url'
      | 'pasted'
      | 'email'
      | 'website';
  }> = [
    { key: 'battlecards', source: 'battlecard' },
    { key: 'faqs', source: 'faq' },
    { key: 'objectionPlaybooks', source: 'objection_playbook' },
    { key: 'documents', source: 'document' },
    { key: 'websites', source: 'website' },
  ];

  for (const { key, source } of buckets) {
    const items = pickArray<Record<string, unknown>>(draft, key);
    if (!items) continue;
    for (const item of items) {
      const title = pickString(item, 'title') ?? pickString(item, 'name') ?? 'Untitled';
      const content = pickString(item, 'content') ?? pickString(item, 'body') ?? '';
      if (!content.trim()) continue;
      await embedAndStoreKnowledgeEntry({
        organizationId,
        source,
        title,
        content,
        sourceUrl: pickString(item, 'sourceUrl'),
        brandVoiceTags: pickStringArray(item, 'brandVoiceTags') ?? undefined,
        tags: pickStringArray(item, 'tags') ?? undefined,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 7: Deployment → deployments + compliance_rules (defaults applied)
// ---------------------------------------------------------------------------

async function propagateDeployment({ organizationId, draft, userId }: ApprovalContext) {
  const name = pickString(draft, 'name') ?? 'Initial launch';
  const icps = await db
    .select({ id: idealCustomerProfiles.id })
    .from(idealCustomerProfiles)
    .where(eq(idealCustomerProfiles.organizationId, organizationId));
  const agents = await db
    .select({ id: agentProfiles.id })
    .from(agentProfiles)
    .where(eq(agentProfiles.organizationId, organizationId));

  const [existing] = await db
    .select()
    .from(deployments)
    .where(and(eq(deployments.organizationId, organizationId), eq(deployments.name, name)))
    .limit(1);

  const patch = {
    name,
    description: pickString(draft, 'description'),
    assignedAgentIds: agents.map((a) => a.id),
    icpTierIds: icps.map((i) => i.id),
    status: 'pending_pilot' as const,
    settings: {
      cadences: draft.cadences ?? [],
      rateLimits: draft.rateLimits ?? {},
      crmIntegration: draft.crmIntegration ?? {},
    },
  };

  if (existing) {
    await db
      .update(deployments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(deployments.id, existing.id));
  } else {
    await db.insert(deployments).values({ ...patch, organizationId });
  }

  // Compliance defaults — conservative per brief.
  const rules = pickArray<Record<string, unknown>>(draft, 'complianceRules') ?? [];
  const seededDefaults = [
    {
      jurisdiction: 'us_can_spam' as const,
      ruleType: 'unsubscribe_required',
      title: 'Include unsubscribe link in every outbound email',
      config: { required: true },
    },
    {
      jurisdiction: 'eu_gdpr' as const,
      ruleType: 'lawful_basis',
      title: 'Track lawful basis and honour erasure requests',
      config: { defaultBasis: 'legitimate_interest' },
    },
    {
      jurisdiction: 'us_ccpa' as const,
      ruleType: 'do_not_sell',
      title: 'Respect "Do Not Sell My Personal Information" signals',
      config: {},
    },
    {
      jurisdiction: 'linkedin_tos' as const,
      ruleType: 'rate_limit',
      title: 'Keep LinkedIn sends under platform caps',
      config: { maxConnectionsPerDay: 80, maxMessagesPerDay: 150 },
    },
  ];
  const existingRules = await db
    .select()
    .from(complianceRules)
    .where(eq(complianceRules.organizationId, organizationId));
  for (const r of seededDefaults) {
    if (existingRules.find((x) => x.ruleType === r.ruleType && x.jurisdiction === r.jurisdiction))
      continue;
    await db.insert(complianceRules).values({ ...r, organizationId });
  }
  for (const r of rules) {
    const ruleType = pickString(r, 'ruleType');
    const juris = pickString(r, 'jurisdiction') as
      | 'us_can_spam'
      | 'eu_gdpr'
      | 'us_ccpa'
      | 'linkedin_tos'
      | 'custom'
      | undefined;
    if (!ruleType || !juris) continue;
    await db.insert(complianceRules).values({
      organizationId,
      jurisdiction: juris,
      ruleType,
      title: pickString(r, 'title') ?? ruleType,
      description: pickString(r, 'description'),
      config: (r.config as object) ?? {},
      enabled: pickBoolean(r, 'enabled') ?? true,
    });
  }
  // `userId` is reserved for attributing the deployment in a future audit field.
  void userId;
}

// ---------------------------------------------------------------------------
// Stage 9: Handoff → handoff_rules + escalation_paths
// ---------------------------------------------------------------------------

async function propagateHandoff({ organizationId, draft }: ApprovalContext) {
  const rules = pickArray<Record<string, unknown>>(draft, 'handoffRules');
  const paths = pickArray<Record<string, unknown>>(draft, 'escalationPaths');

  if (rules) {
    await db.delete(handoffRules).where(eq(handoffRules.organizationId, organizationId));
    const insertedRules: { name: string; id: string }[] = [];
    for (const r of rules) {
      const name = pickString(r, 'name') ?? 'Unnamed rule';
      const [created] = await db
        .insert(handoffRules)
        .values({
          organizationId,
          name,
          naturalLanguageRule:
            pickString(r, 'naturalLanguageRule') ?? pickString(r, 'rule') ?? name,
          triggerConfig: (r.triggerConfig as object) ?? {},
          priority: pickNumber(r, 'priority') ?? 0,
          isActive: pickBoolean(r, 'isActive') ?? true,
        })
        .returning({ id: handoffRules.id, name: handoffRules.name });
      if (created) insertedRules.push(created);
    }

    if (paths) {
      await db
        .delete(escalationPaths)
        .where(eq(escalationPaths.organizationId, organizationId));
      let order = 0;
      for (const p of paths) {
        const ruleName = pickString(p, 'ruleName') ?? pickString(p, 'rule');
        const match = insertedRules.find((r) => r.name === ruleName);
        await db.insert(escalationPaths).values({
          organizationId,
          handoffRuleId: match?.id,
          role:
            (pickString(p, 'role') as
              | 'am'
              | 'ae'
              | 'sales_lead'
              | 'success'
              | 'support'
              | 'custom') ?? 'ae',
          slaMinutes: pickNumber(p, 'slaMinutes') ?? 60,
          contextPacketTemplate: pickString(p, 'contextPacketTemplate'),
          notificationChannels: pickStringArray(p, 'notificationChannels') ?? undefined,
          sortOrder: order++,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function pickString(obj: Record<string, unknown> | unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : undefined;
}

function pickNumber(obj: Record<string, unknown> | unknown, key: string): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function pickBoolean(obj: Record<string, unknown> | unknown, key: string): boolean | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'boolean' ? v : undefined;
}

function pickDecimal(
  obj: Record<string, unknown> | unknown,
  key: string,
): string | null | undefined {
  const n = pickNumber(obj, key);
  if (n === undefined) return undefined;
  return String(n);
}

function pickStringArray(
  obj: Record<string, unknown> | unknown,
  key: string,
): string[] | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return undefined;
  return v
    .map((x) => (typeof x === 'string' ? x : typeof x === 'object' ? JSON.stringify(x) : String(x)))
    .filter((s) => s.length > 0);
}

function pickArray<T = unknown>(
  obj: Record<string, unknown> | unknown,
  key: string,
): T[] | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : undefined;
}

export { inArray }; // re-export for convenience in other modules
