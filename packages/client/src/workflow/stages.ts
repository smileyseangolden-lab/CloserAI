import {
  Building2,
  Database,
  Bot,
  Target,
  Sparkles,
  BookOpen,
  Rocket,
  ShieldCheck,
  UserCog,
  BarChart3,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

export interface StageDefinition {
  id: string;
  order: number;
  title: string;
  description: string;
  openingPrompt: string;
  icon: LucideIcon;
  /** Plain-English list of the output fields the assistant is aiming to produce. */
  draftFields: Array<{ key: string; label: string; kind: 'text' | 'list' | 'object' }>;
}

export const STAGES: StageDefinition[] = [
  {
    id: 'company-profile',
    order: 1,
    title: 'Company Profile',
    description: 'Bootstrap your company identity from your website.',
    openingPrompt: 'Just give me your website — I’ll do the rest.',
    icon: Building2,
    draftFields: [
      { key: 'companyName', label: 'Company name', kind: 'text' },
      { key: 'mission', label: 'Mission', kind: 'text' },
      { key: 'vision', label: 'Vision', kind: 'text' },
      { key: 'employeeCount', label: 'Employee count', kind: 'text' },
      { key: 'revenueBand', label: 'Revenue band', kind: 'text' },
      { key: 'accolades', label: 'Accolades', kind: 'list' },
      { key: 'logos', label: 'Customer logos', kind: 'list' },
    ],
  },
  {
    id: 'data-sources',
    order: 2,
    title: 'Data Sources',
    description: 'Recommend + configure enrichment and prospecting providers.',
    openingPrompt: 'Tell me about your customers and I’ll recommend the right data sources.',
    icon: Database,
    draftFields: [
      { key: 'recommendedProviders', label: 'Recommended providers', kind: 'list' },
      { key: 'tieredStack', label: 'Tiered stack', kind: 'object' },
      { key: 'estimatedMonthlyCost', label: 'Estimated monthly cost', kind: 'text' },
      { key: 'enrichmentRules', label: 'Enrichment rules', kind: 'list' },
    ],
  },
  {
    id: 'agent-builder',
    order: 3,
    title: 'Agent Builder',
    description: 'Design AI sales agents — tone, channels, squad.',
    openingPrompt: 'Describe how you’d want a great salesperson to sound and I’ll build the agent.',
    icon: Bot,
    draftFields: [
      { key: 'agents', label: 'Agents', kind: 'list' },
      { key: 'activatedRoles', label: 'Activated roles', kind: 'list' },
      { key: 'brandVoice', label: 'Brand voice', kind: 'text' },
    ],
  },
  {
    id: 'icp',
    order: 4,
    title: 'ICP',
    description: 'Extract firmographic patterns from your best customers.',
    openingPrompt: 'Tell me about your best three customers and I’ll build your ICP.',
    icon: Target,
    draftFields: [
      { key: 'tiers', label: 'Tiers (A/B/C)', kind: 'list' },
      { key: 'personas', label: 'Personas', kind: 'list' },
      { key: 'buyingSignals', label: 'Buying signals', kind: 'list' },
      { key: 'disqualifiers', label: 'Disqualifiers', kind: 'list' },
    ],
  },
  {
    id: 'value-prop',
    order: 5,
    title: 'Value Prop',
    description: 'Pitch variants, pricing tiers, competitive matrix.',
    openingPrompt: 'Talk me through what you sell and I’ll build your pitch.',
    icon: Sparkles,
    draftFields: [
      { key: 'pitchVariants', label: 'Pitch variants', kind: 'list' },
      { key: 'pricingTiers', label: 'Pricing tiers', kind: 'list' },
      { key: 'competitiveMatrix', label: 'Competitive matrix', kind: 'object' },
      { key: 'differentiators', label: 'Differentiators', kind: 'list' },
    ],
  },
  {
    id: 'knowledge',
    order: 6,
    title: 'Knowledge',
    description: 'Ingest docs, build battlecards, FAQs, objection playbooks.',
    openingPrompt: 'Upload anything — docs, PDFs, website, past emails — I’ll build the library.',
    icon: BookOpen,
    draftFields: [
      { key: 'battlecards', label: 'Battlecards', kind: 'list' },
      { key: 'faqs', label: 'FAQs', kind: 'list' },
      { key: 'objectionPlaybooks', label: 'Objection playbooks', kind: 'list' },
      { key: 'brandVoiceNotes', label: 'Brand voice notes', kind: 'text' },
    ],
  },
  {
    id: 'deployment',
    order: 7,
    title: 'Deployment',
    description: 'Cadences, compliance, rate limits, CRM integrations.',
    openingPrompt: 'Walk me through what you want to launch — I’ll configure it.',
    icon: Rocket,
    draftFields: [
      { key: 'cadences', label: 'Cadences', kind: 'list' },
      { key: 'complianceRules', label: 'Compliance rules', kind: 'list' },
      { key: 'rateLimits', label: 'Rate limits', kind: 'object' },
      { key: 'crmIntegration', label: 'CRM integration', kind: 'object' },
    ],
  },
  {
    id: 'pilot',
    order: 8,
    title: 'Pilot',
    description: 'Red-team messages before launch; go / no-go recommendation.',
    openingPrompt: 'I’ll run QA on every message before it ships.',
    icon: ShieldCheck,
    draftFields: [
      { key: 'redTeamResults', label: 'Red-team results', kind: 'list' },
      { key: 'goNoGo', label: 'Go / No-Go', kind: 'text' },
      { key: 'reasoning', label: 'Reasoning', kind: 'text' },
    ],
  },
  {
    id: 'handoff',
    order: 9,
    title: 'Handoff',
    description: 'Rules for when a human takes over + rep context packets.',
    openingPrompt: 'Tell me when you want a human involved — I’ll build the rules.',
    icon: UserCog,
    draftFields: [
      { key: 'handoffRules', label: 'Handoff rules', kind: 'list' },
      { key: 'escalationPaths', label: 'Escalation paths', kind: 'list' },
      { key: 'contextPacketTemplate', label: 'Context packet template', kind: 'text' },
    ],
  },
  {
    id: 'analytics',
    order: 10,
    title: 'Analytics',
    description: 'Plain-English pipeline queries and anomaly detection.',
    openingPrompt: 'Ask me anything about your pipeline — in plain English.',
    icon: BarChart3,
    draftFields: [
      { key: 'savedQueries', label: 'Saved queries', kind: 'list' },
      { key: 'customDashboards', label: 'Custom dashboards', kind: 'list' },
      { key: 'anomalies', label: 'Anomalies', kind: 'list' },
    ],
  },
  {
    id: 'optimization',
    order: 11,
    title: 'Optimization',
    description: 'Continuous change proposals + autonomous A/B testing.',
    openingPrompt: 'I’ll tell you what to change — or change it for you.',
    icon: Wand2,
    draftFields: [
      { key: 'proposals', label: 'Proposals', kind: 'list' },
      { key: 'experiments', label: 'Experiments', kind: 'list' },
      { key: 'results', label: 'Results', kind: 'list' },
    ],
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
