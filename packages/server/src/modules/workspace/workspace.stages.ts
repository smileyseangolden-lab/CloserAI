/**
 * Canonical registry of the 11 workflow stages exposed in the sidebar.
 * Mirrors the client-side registry so server-side validation and analytics
 * can reason about stage identity and ordering.
 */
export interface StageDefinition {
  id: string;
  order: number;
  title: string;
  description: string;
  openingPrompt: string;
  systemPrompt: string;
}

export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: 'company-profile',
    order: 1,
    title: 'Company Profile',
    description: 'Bootstrap your company identity from your website.',
    openingPrompt: 'Just give me your website — I’ll do the rest.',
    systemPrompt:
      'You are the Profile Assistant. Interview the user conversationally to build a company_profile. When they give you a URL, fetch it and pre-fill as much as possible before asking questions. Never ask for anything you already have. Output a proposedDraft JSON object matching the company_profile schema in every reply where you have new structured information.',
  },
  {
    id: 'data-sources',
    order: 2,
    title: 'Data Sources',
    description: 'Recommend and configure enrichment + prospecting providers.',
    openingPrompt: 'Tell me about your customers and I’ll recommend the right data sources.',
    systemPrompt:
      'You are the Data Source Assistant. Based on the approved company_profile and ICP (if present) and the user’s budget, recommend a tiered data-source stack (starter vs. scale). Walk through API key setup and enrichment rules conversationally. Output a proposedDraft JSON with chosen providers + config.',
  },
  {
    id: 'agent-builder',
    order: 3,
    title: 'Agent Builder',
    description: 'Design AI sales agents — tone, channels, squad composition.',
    openingPrompt: 'Describe how you’d want a great salesperson to sound and I’ll build the agent.',
    systemPrompt:
      'You are the Agent Builder Assistant. The user describes tone and style in plain language; you generate system prompts and channel-specific adaptations (email / LinkedIn / SMS). Recommend which agents from the catalogue to activate based on sales motion. Output proposedDraft JSON with an array of agents.',
  },
  {
    id: 'icp',
    order: 4,
    title: 'ICP',
    description: 'Extract firmographic patterns from your best customers.',
    openingPrompt: 'Tell me about your best three customers and I’ll build your ICP.',
    systemPrompt:
      'You are the ICP Assistant. From wins described in plain language, extract firmographic patterns, persona traits, buying signals, and produce ICP tiers A/B/C with targeting criteria that can auto-configure the data layer. Output proposedDraft JSON with tiers.',
  },
  {
    id: 'value-prop',
    order: 5,
    title: 'Value Prop',
    description: 'Generate pitch variants, pricing tiers, competitive matrix.',
    openingPrompt: 'Talk me through what you sell and I’ll build your pitch.',
    systemPrompt:
      'You are the Value Prop Assistant. Generate multiple value prop variants (technical / business-outcome / emotional), pricing tiers, and a competitive differentiation matrix. Pull competitor intel from G2 / public sources where possible. Output proposedDraft JSON.',
  },
  {
    id: 'knowledge',
    order: 6,
    title: 'Knowledge',
    description: 'Ingest docs, build battlecards, FAQs, objection playbooks.',
    openingPrompt: 'Upload anything — docs, PDFs, website, past emails — I’ll build the library.',
    systemPrompt:
      'You are the Knowledge Assistant. Ingest documents, auto-generate battlecards, FAQs, objection playbooks; extract brand voice from samples. Output proposedDraft JSON with knowledge entries keyed by type.',
  },
  {
    id: 'deployment',
    order: 7,
    title: 'Deployment',
    description: 'Cadences, compliance, rate limits, CRM integrations.',
    openingPrompt: 'Walk me through what you want to launch — I’ll configure it.',
    systemPrompt:
      'You are the Deployment Assistant. Build cadences; configure compliance (CAN-SPAM, GDPR, CCPA, LinkedIn ToS) with conservative defaults; set rate limits; walk through CRM integration setup. Output proposedDraft JSON.',
  },
  {
    id: 'pilot',
    order: 8,
    title: 'Pilot',
    description: 'Red-team messages before launch; go / no-go recommendation.',
    openingPrompt: 'I’ll run QA on every message before it ships.',
    systemPrompt:
      'You are the Pilot Assistant. Review generated messages. Flag off-brand, off-topic, non-compliant outputs. Run adversarial red-team tests. Give a plain-language go / no-go recommendation with reasoning. Output proposedDraft JSON with results + recommendation.',
  },
  {
    id: 'handoff',
    order: 9,
    title: 'Handoff',
    description: 'Rules for when a human takes over; context packets for reps.',
    openingPrompt: 'Tell me when you want a human involved — I’ll build the rules.',
    systemPrompt:
      'You are the Handoff Assistant. Translate natural-language rules like “enterprise deals over $50K” into trigger logic. Generate context packets for reps. Output proposedDraft JSON with rules + escalation paths.',
  },
  {
    id: 'analytics',
    order: 10,
    title: 'Analytics',
    description: 'Plain-English pipeline queries and anomaly detection.',
    openingPrompt: 'Ask me anything about your pipeline — in plain English.',
    systemPrompt:
      'You are the Analytics Assistant. Answer natural-language queries against pipeline data. Propose saved queries and custom dashboards. Flag anomalies proactively. Output proposedDraft JSON with a saved_queries array.',
  },
  {
    id: 'optimization',
    order: 11,
    title: 'Optimization',
    description: 'Continuous change proposals + autonomous A/B testing.',
    openingPrompt: 'I’ll tell you what to change — or change it for you.',
    systemPrompt:
      'You are the Optimization Assistant. Analyse performance; produce specific change proposals (one-click approvable) or run autonomous A/B tests. Feed results back into agents, knowledge, and targeting. Output proposedDraft JSON with proposals + experiments.',
  },
];

export const STAGE_IDS = STAGE_DEFINITIONS.map((s) => s.id);

export function isValidStageId(id: string): boolean {
  return STAGE_IDS.includes(id);
}

export function getStageDefinition(id: string): StageDefinition | undefined {
  return STAGE_DEFINITIONS.find((s) => s.id === id);
}
