/**
 * Tool definitions + handlers exposed to the stage assistants.
 *
 * Every tool is side-effect-free from the user's perspective (read-only
 * research) — writes happen only when the user clicks Save & Continue, which
 * triggers stageApproval propagation. Handlers are tenant-scoped; tool calls
 * never reach data outside the caller's organization.
 */
import { db } from '../../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { workspaceStages, knowledgeBase, businessProfiles } from '../../db/schema.js';
import { searchOrgKnowledge } from '../ai/orgKnowledge.js';
import { logger } from '../../utils/logger.js';
import { getStageDefinition } from '../workspace/workspace.stages.js';

export interface ToolContext {
  organizationId: string;
  stageId: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** The subset of tools every stage gets. */
export const COMMON_TOOLS: ToolSpec[] = [
  {
    name: 'web_fetch',
    description:
      "Fetches a URL and returns readable text content (HTML stripped, max ~20k chars). Use this whenever the user gives you a URL or when you need to research the user's domain, a prospect's site, a competitor's G2 page, etc.",
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL' },
      },
      required: ['url'],
    },
  },
  {
    name: 'read_approved_stage',
    description:
      "Read a previously-approved workflow stage's output. Use this when you need structured data from an earlier step (e.g. the ICP tiers from Stage 4 while building a value prop in Stage 5).",
    input_schema: {
      type: 'object',
      properties: {
        stageId: {
          type: 'string',
          enum: [
            'company-profile',
            'data-sources',
            'agent-builder',
            'icp',
            'value-prop',
            'knowledge',
            'deployment',
            'pilot',
            'handoff',
            'analytics',
            'optimization',
          ],
        },
      },
      required: ['stageId'],
    },
  },
  {
    name: 'search_knowledge_base',
    description:
      "Semantic search the organisation's knowledge base (battlecards, FAQs, objection playbooks, ingested docs). Returns the top matches.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_company_profile',
    description:
      "Fetch the caller's own company profile (already bootstrapped in Stage 1). Useful for grounding tone, branding, and differentiation.",
    input_schema: { type: 'object', properties: {} },
  },
];

/** Stage-specific tool additions. */
export const STAGE_TOOL_OVERRIDES: Record<string, ToolSpec[]> = {
  'company-profile': [
    {
      name: 'scrape_linkedin_company',
      description:
        "Stub: looks up a company's public LinkedIn page. Returns employee count range, industry, headquarters, specialties when available. May return a partial result.",
      input_schema: {
        type: 'object',
        properties: { domain: { type: 'string' } },
        required: ['domain'],
      },
    },
    {
      name: 'lookup_crunchbase',
      description:
        'Stub: looks up Crunchbase data for a company domain. Returns founded year, revenue band, total funding when available.',
      input_schema: {
        type: 'object',
        properties: { domain: { type: 'string' } },
        required: ['domain'],
      },
    },
  ],
  'value-prop': [
    {
      name: 'lookup_g2_reviews',
      description:
        "Stub: fetches G2 star rating + top review themes for a competitor. Wrap the competitor's slug (e.g. 'salesforce').",
      input_schema: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
    },
  ],
};

export function toolsForStage(stageId: string): ToolSpec[] {
  return [...COMMON_TOOLS, ...(STAGE_TOOL_OVERRIDES[stageId] ?? [])];
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case 'web_fetch':
        return await webFetch(String(input.url ?? ''));
      case 'read_approved_stage':
        return await readApprovedStage(String(input.stageId ?? ''), ctx);
      case 'search_knowledge_base':
        return await searchKnowledge(
          String(input.query ?? ''),
          Number(input.limit ?? 5),
          ctx,
        );
      case 'get_company_profile':
        return await getCompanyProfile(ctx);
      case 'scrape_linkedin_company':
        return linkedInStub(String(input.domain ?? ''));
      case 'lookup_crunchbase':
        return crunchbaseStub(String(input.domain ?? ''));
      case 'lookup_g2_reviews':
        return g2Stub(String(input.slug ?? ''));
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    logger.warn({ err, name, input }, 'tool call failed');
    return JSON.stringify({
      error: err instanceof Error ? err.message : 'Tool call failed',
    });
  }
}

async function webFetch(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return JSON.stringify({ error: 'Invalid URL' });
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CloserAIBot/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status}`, url });
  const ct = res.headers.get('content-type') ?? '';
  const bodyRaw = await res.text();
  let text = bodyRaw;
  if (ct.includes('html')) {
    text = bodyRaw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return JSON.stringify({ url, contentType: ct, text: text.slice(0, 20_000) });
}

async function readApprovedStage(stageId: string, ctx: ToolContext): Promise<string> {
  const def = getStageDefinition(stageId);
  if (!def) return JSON.stringify({ error: `Unknown stage ${stageId}` });
  const [row] = await db
    .select()
    .from(workspaceStages)
    .where(
      and(
        eq(workspaceStages.organizationId, ctx.organizationId),
        eq(workspaceStages.stageId, stageId),
      ),
    )
    .limit(1);
  if (!row) return JSON.stringify({ stageId, status: 'not_started' });
  return JSON.stringify({
    stageId,
    status: row.status,
    approvedAt: row.approvedAt,
    data: row.data,
  });
}

async function searchKnowledge(
  query: string,
  limit: number,
  ctx: ToolContext,
): Promise<string> {
  const hits = await searchOrgKnowledge(ctx.organizationId, query, Math.min(limit, 10));
  return JSON.stringify(hits);
}

async function getCompanyProfile(ctx: ToolContext): Promise<string> {
  const [row] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, ctx.organizationId))
    .limit(1);

  // Also surface the latest knowledge_base "brand voice" tags in case Stage 6
  // captured any — useful grounding for Stage 3 agent tone generation.
  const voice = await db
    .select({ tags: knowledgeBase.brandVoiceTags })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.organizationId, ctx.organizationId))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(1);

  return JSON.stringify({
    profile: row ?? null,
    brandVoiceTags: voice[0]?.tags ?? [],
  });
}

// -------- External-API stubs (wire real providers later) -------------------

function linkedInStub(domain: string): string {
  return JSON.stringify({
    stub: true,
    note: 'LinkedIn scraping not yet connected. Ask the user directly or rely on web_fetch of the LinkedIn public page.',
    domain,
  });
}

function crunchbaseStub(domain: string): string {
  return JSON.stringify({
    stub: true,
    note: 'Crunchbase lookup not yet connected. Rely on web_fetch of crunchbase.com/organization/{slug}.',
    domain,
  });
}

function g2Stub(slug: string): string {
  return JSON.stringify({
    stub: true,
    note: 'G2 API not yet connected. Use web_fetch on https://www.g2.com/products/{slug}/reviews.',
    slug,
  });
}
