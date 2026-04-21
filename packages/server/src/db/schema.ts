import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  decimal,
  date,
  time,
  real,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const EMBEDDING_DIMENSIONS = 1536;

// pgvector column type. Inlined here (rather than a separate file) so
// drizzle-kit's schema loader — which doesn't do .js → .ts resolution —
// can load this module without a relative import.
const vector = (name: string, config: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
    dataType(c) {
      return `vector(${c?.dimensions ?? config.dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string | number[]): number[] {
      if (Array.isArray(value)) return value;
      return JSON.parse(value) as number[];
    },
  })(name, config);

// =====================================================================
// ENUMS
// =====================================================================

export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'free',
  'starter',
  'professional',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trial',
  'past_due',
  'canceled',
]);

export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'admin',
  'manager',
  'member',
  'viewer',
]);

export const companySizeEnum = pgEnum('company_size', [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5000+',
]);

export const leadSourceEnum = pgEnum('lead_source', [
  'scraped',
  'uploaded',
  'manual',
  'inbound',
  'referral',
  'enriched',
]);

export const enrichmentStatusEnum = pgEnum('enrichment_status', [
  'pending',
  'enriched',
  'failed',
  'stale',
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'engaging',
  'warm',
  'hot',
  'qualified',
  'disqualified',
  'converted',
  'lost',
]);

export const seniorityLevelEnum = pgEnum('seniority_level', [
  'c_suite',
  'vp',
  'director',
  'manager',
  'senior',
  'mid',
  'junior',
  'intern',
]);

export const preferredChannelEnum = pgEnum('preferred_channel', [
  'email',
  'linkedin',
  'phone',
  'sms',
]);

export const agentTypeEnum = pgEnum('agent_type', [
  'prospector',
  'nurturer',
  'closer',
  'hybrid',
]);

export const personalityStyleEnum = pgEnum('personality_style', [
  'technical',
  'consultative',
  'social_friendly',
  'executive',
  'challenger',
  'educational',
]);

export const responseSpeedEnum = pgEnum('response_speed', [
  'instant',
  'fast_1hr',
  'moderate_4hr',
  'slow_24hr',
]);

export const knowledgeTypeEnum = pgEnum('knowledge_type', [
  'product_info',
  'objection_handling',
  'competitor_intel',
  'pricing',
  'case_study',
  'faq',
  'custom',
]);

export const campaignTypeEnum = pgEnum('campaign_type', [
  'outbound_cold',
  'nurture_warm',
  're_engagement',
  'event_follow_up',
  'closing',
  'custom',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'active',
  'paused',
  'completed',
  'archived',
]);

export const campaignStrategyEnum = pgEnum('campaign_strategy', [
  'educational',
  'direct',
  'social_proof',
  'pain_point',
  'challenger',
  'value_first',
]);

export const cadenceChannelEnum = pgEnum('cadence_channel', [
  'email',
  'linkedin_connection',
  'linkedin_message',
  'linkedin_comment',
  'phone_call',
  'sms',
  'delay',
]);

export const abVariantEnum = pgEnum('ab_variant', ['A', 'B']);

export const campaignLeadStatusEnum = pgEnum('campaign_lead_status', [
  'queued',
  'active',
  'paused',
  'replied',
  'warm',
  'qualified',
  'converted',
  'opted_out',
  'bounced',
  'completed',
]);

export const messageChannelEnum = pgEnum('message_channel', [
  'email',
  'linkedin',
  'phone',
  'sms',
  'internal_note',
]);

export const messageDirectionEnum = pgEnum('message_direction', [
  'outbound',
  'inbound',
]);

export const messageStatusEnum = pgEnum('message_status', [
  'draft',
  'queued',
  'sending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'failed',
]);

export const intentClassificationEnum = pgEnum('intent_classification', [
  'interested',
  'not_interested',
  'more_info',
  'objection',
  'meeting_request',
  'referral',
  'out_of_office',
  'unsubscribe',
  'unclear',
]);

export const activityTypeEnum = pgEnum('activity_type', [
  'email_sent',
  'email_opened',
  'email_clicked',
  'email_replied',
  'email_bounced',
  'linkedin_connection_sent',
  'linkedin_connection_accepted',
  'linkedin_message_sent',
  'linkedin_message_replied',
  'phone_call',
  'meeting_scheduled',
  'meeting_completed',
  'lead_scored',
  'lead_status_changed',
  'agent_handoff',
  'human_handoff',
  'note_added',
  'lead_created',
  'lead_enriched',
  'campaign_entered',
  'campaign_exited',
  'deal_created',
  'deal_stage_changed',
  'deal_won',
  'deal_lost',
]);

export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'discovery',
  'qualification',
  'proposal',
  'negotiation',
  'verbal_commit',
  'closed_won',
  'closed_lost',
]);

export const warmupStatusEnum = pgEnum('warmup_status', [
  'not_started',
  'warming',
  'ready',
  'degraded',
]);

export const jobTypeEnum = pgEnum('job_type', [
  'send_email',
  'send_linkedin',
  'enrich_lead',
  'score_lead',
  'ai_generate',
  'scrape_leads',
  'warmup_email',
  'sync_inbox',
  'analyze_reply',
  'schedule_meeting',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'retrying',
]);

export const workspaceStageStatusEnum = pgEnum('workspace_stage_status', [
  'locked',
  'in_progress',
  'approved',
]);

export const assistantMessageRoleEnum = pgEnum('assistant_message_role', [
  'user',
  'assistant',
]);

// =====================================================================
// CORE ENTITIES
// =====================================================================

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  industry: text('industry'),
  website: text('website'),
  description: text('description'),
  logoUrl: text('logo_url'),
  subscriptionTier: subscriptionTierEnum('subscription_tier').notNull().default('free'),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('trial'),
  trialEndsAt: timestamp('trial_ends_at'),
  settings: jsonb('settings').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    role: userRoleEnum('role').notNull().default('member'),
    avatarUrl: text('avatar_url'),
    lastLoginAt: timestamp('last_login_at'),
    isActive: boolean('is_active').notNull().default(true),
    preferences: jsonb('preferences').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    emailIdx: uniqueIndex('idx_users_email').on(t.email).where(sql`${t.deletedAt} IS NULL`),
    orgIdx: index('idx_users_org').on(t.organizationId),
  }),
);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('member'),
  invitedBy: uuid('invited_by').references(() => users.id),
  acceptedAt: timestamp('accepted_at'),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================================
// BUSINESS PROFILE & ICP
// =====================================================================

export const businessProfiles = pgTable('business_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  industry: text('industry'),
  subIndustry: text('sub_industry'),
  companySize: companySizeEnum('company_size'),
  annualRevenueRange: text('annual_revenue_range'),
  headquartersLocation: text('headquarters_location'),
  website: text('website'),
  valueProposition: text('value_proposition'),
  keyDifferentiators: text('key_differentiators').array(),
  targetVerticals: text('target_verticals').array(),
  productsServices: jsonb('products_services').default(sql`'[]'::jsonb`),
  competitors: text('competitors').array(),
  painPointsSolved: text('pain_points_solved').array(),
  aiGeneratedSummary: text('ai_generated_summary'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const idealCustomerProfiles = pgTable('ideal_customer_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  targetIndustries: text('target_industries').array(),
  targetCompanySizes: text('target_company_sizes').array(),
  targetRevenueRanges: text('target_revenue_ranges').array(),
  targetJobTitles: text('target_job_titles').array(),
  targetDepartments: text('target_departments').array(),
  targetGeographies: text('target_geographies').array(),
  technographics: jsonb('technographics').default(sql`'{}'::jsonb`),
  firmographics: jsonb('firmographics').default(sql`'{}'::jsonb`),
  buyingSignals: text('buying_signals').array(),
  disqualifiers: text('disqualifiers').array(),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  aiRefinementNotes: text('ai_refinement_notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

// =====================================================================
// LEADS & CONTACTS
// =====================================================================

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    icpId: uuid('icp_id').references(() => idealCustomerProfiles.id),
    companyName: text('company_name').notNull(),
    companyWebsite: text('company_website'),
    companyIndustry: text('company_industry'),
    companySize: text('company_size'),
    companyRevenueRange: text('company_revenue_range'),
    companyLocation: text('company_location'),
    companyLinkedinUrl: text('company_linkedin_url'),
    companyDescription: text('company_description'),
    technographics: jsonb('technographics').default(sql`'{}'::jsonb`),
    firmographics: jsonb('firmographics').default(sql`'{}'::jsonb`),
    source: leadSourceEnum('source').notNull().default('manual'),
    sourceDetail: text('source_detail'),
    enrichmentData: jsonb('enrichment_data').default(sql`'{}'::jsonb`),
    enrichmentStatus: enrichmentStatusEnum('enrichment_status').notNull().default('pending'),
    enrichedAt: timestamp('enriched_at'),
    leadScore: integer('lead_score').notNull().default(0),
    leadScoreBreakdown: jsonb('lead_score_breakdown').default(sql`'{}'::jsonb`),
    status: leadStatusEnum('status').notNull().default('new'),
    statusChangedAt: timestamp('status_changed_at').notNull().defaultNow(),
    tags: text('tags').array(),
    customFields: jsonb('custom_fields').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    orgStatusIdx: index('idx_leads_org_status').on(t.organizationId, t.status),
    orgScoreIdx: index('idx_leads_org_score').on(t.organizationId, t.leadScore),
  }),
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: varchar('email', { length: 255 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    phone: text('phone'),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    jobTitle: text('job_title'),
    department: text('department'),
    seniorityLevel: seniorityLevelEnum('seniority_level'),
    linkedinUrl: text('linkedin_url'),
    twitterUrl: text('twitter_url'),
    location: text('location'),
    bio: text('bio'),
    profilePhotoUrl: text('profile_photo_url'),
    isPrimary: boolean('is_primary').notNull().default(false),
    isDecisionMaker: boolean('is_decision_maker').notNull().default(false),
    personalityNotes: text('personality_notes'),
    preferredChannel: preferredChannelEnum('preferred_channel'),
    timezone: text('timezone'),
    doNotContact: boolean('do_not_contact').notNull().default(false),
    lastContactedAt: timestamp('last_contacted_at'),
    engagementScore: integer('engagement_score').notNull().default(0),
    customFields: jsonb('custom_fields').default(sql`'{}'::jsonb`),
    conversationSummary: text('conversation_summary'),
    conversationSummaryUpdatedAt: timestamp('conversation_summary_updated_at'),
    conversationSummaryLastMessageId: uuid('conversation_summary_last_message_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    leadIdx: index('idx_contacts_lead').on(t.leadId),
    emailIdx: index('idx_contacts_email').on(t.email),
  }),
);

// =====================================================================
// AGENTS
// =====================================================================

export const agentProfiles = pgTable('agent_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  agentType: agentTypeEnum('agent_type').notNull(),
  personalityStyle: personalityStyleEnum('personality_style').notNull(),
  toneDescription: text('tone_description'),
  writingStyleExamples: text('writing_style_examples').array(),
  systemPromptOverride: text('system_prompt_override'),
  avatarUrl: text('avatar_url'),
  senderName: text('sender_name').notNull(),
  senderTitle: text('sender_title'),
  emailSignature: text('email_signature'),
  linkedinBio: text('linkedin_bio'),
  responseSpeed: responseSpeedEnum('response_speed').notNull().default('fast_1hr'),
  workingHoursStart: time('working_hours_start').default('08:00'),
  workingHoursEnd: time('working_hours_end').default('18:00'),
  workingDays: integer('working_days').array().default(sql`ARRAY[1,2,3,4,5]`),
  maxDailyOutreach: integer('max_daily_outreach').notNull().default(50),
  maxConcurrentConversations: integer('max_concurrent_conversations').notNull().default(100),
  escalationRules: jsonb('escalation_rules').default(sql`'{}'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  performanceMetrics: jsonb('performance_metrics').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const agentKnowledgeBase = pgTable('agent_knowledge_base', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agentProfiles.id, { onDelete: 'cascade' }),
  knowledgeType: knowledgeTypeEnum('knowledge_type').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
  embeddingModel: text('embedding_model'),
  embeddedAt: timestamp('embedded_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// =====================================================================
// CAMPAIGNS & CADENCES
// =====================================================================

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  icpId: uuid('icp_id').references(() => idealCustomerProfiles.id),
  name: text('name').notNull(),
  description: text('description'),
  campaignType: campaignTypeEnum('campaign_type').notNull(),
  status: campaignStatusEnum('status').notNull().default('draft'),
  assignedAgentId: uuid('assigned_agent_id').references(() => agentProfiles.id),
  closingAgentId: uuid('closing_agent_id').references(() => agentProfiles.id),
  strategy: campaignStrategyEnum('strategy').notNull().default('educational'),
  channels: text('channels').array().default(sql`ARRAY['email']::text[]`),
  abTestEnabled: boolean('a_b_test_enabled').notNull().default(false),
  dailySendLimit: integer('daily_send_limit').notNull().default(100),
  startDate: date('start_date'),
  endDate: date('end_date'),
  warmLeadThreshold: integer('warm_lead_threshold').notNull().default(50),
  autoCloseEnabled: boolean('auto_close_enabled').notNull().default(false),
  humanHandoffEnabled: boolean('human_handoff_enabled').notNull().default(true),
  handoffUserId: uuid('handoff_user_id').references(() => users.id),
  metricsSnapshot: jsonb('metrics_snapshot').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const cadenceSteps = pgTable('cadence_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').notNull(),
  channel: cadenceChannelEnum('channel').notNull(),
  delayDays: integer('delay_days').notNull().default(0),
  delayHours: integer('delay_hours').notNull().default(0),
  subjectTemplate: text('subject_template'),
  bodyTemplate: text('body_template').notNull(),
  aiPersonalizationEnabled: boolean('ai_personalization_enabled').notNull().default(true),
  personalizationInstructions: text('personalization_instructions'),
  abVariant: abVariantEnum('a_b_variant'),
  sendWindowStart: time('send_window_start').default('08:00'),
  sendWindowEnd: time('send_window_end').default('18:00'),
  skipIfReplied: boolean('skip_if_replied').notNull().default(true),
  skipIfOpened: boolean('skip_if_opened').default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const campaignLeads = pgTable(
  'campaign_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    currentStep: integer('current_step').notNull().default(0),
    status: campaignLeadStatusEnum('status').notNull().default('queued'),
    enteredAt: timestamp('entered_at').notNull().defaultNow(),
    lastStepExecutedAt: timestamp('last_step_executed_at'),
    nextStepScheduledAt: timestamp('next_step_scheduled_at'),
    warmScore: integer('warm_score').notNull().default(0),
    interactionCount: integer('interaction_count').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    handoffTriggeredAt: timestamp('handoff_triggered_at'),
    handoffAcceptedAt: timestamp('handoff_accepted_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('idx_campaign_leads_status').on(t.campaignId, t.status),
    nextStepIdx: index('idx_campaign_leads_next_step').on(t.nextStepScheduledAt),
  }),
);

// =====================================================================
// COMMUNICATION & ACTIVITY
// =====================================================================

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignLeadId: uuid('campaign_lead_id').references(() => campaignLeads.id, {
      onDelete: 'set null',
    }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agentProfiles.id),
    userId: uuid('user_id').references(() => users.id),
    channel: messageChannelEnum('channel').notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    subject: text('subject'),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    templateUsed: text('template_used'),
    aiGenerated: boolean('ai_generated').notNull().default(false),
    aiModelUsed: text('ai_model_used'),
    aiPromptTokens: integer('ai_prompt_tokens'),
    aiCompletionTokens: integer('ai_completion_tokens'),
    sentimentScore: real('sentiment_score'),
    intentClassification: intentClassificationEnum('intent_classification'),
    externalMessageId: text('external_message_id'),
    threadId: text('thread_id'),
    status: messageStatusEnum('status').notNull().default('draft'),
    openedAt: timestamp('opened_at'),
    clickedAt: timestamp('clicked_at'),
    repliedAt: timestamp('replied_at'),
    bouncedAt: timestamp('bounced_at'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    threadIdx: index('idx_messages_thread').on(t.threadId),
    contactIdx: index('idx_messages_contact').on(t.contactId, t.createdAt),
    campaignLeadIdx: index('idx_messages_campaign_lead').on(t.campaignLeadId, t.createdAt),
  }),
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    agentId: uuid('agent_id').references(() => agentProfiles.id),
    activityType: activityTypeEnum('activity_type').notNull(),
    description: text('description'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    leadIdx: index('idx_activities_lead').on(t.leadId, t.createdAt),
    orgTypeIdx: index('idx_activities_org_type').on(t.organizationId, t.activityType, t.createdAt),
  }),
);

// =====================================================================
// OPPORTUNITIES (CLOSING)
// =====================================================================

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id),
    assignedAgentId: uuid('assigned_agent_id').references(() => agentProfiles.id),
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    title: text('title').notNull(),
    description: text('description'),
    stage: opportunityStageEnum('stage').notNull().default('discovery'),
    stageChangedAt: timestamp('stage_changed_at').notNull().defaultNow(),
    estimatedValue: decimal('estimated_value', { precision: 14, scale: 2 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    probability: integer('probability').notNull().default(25),
    expectedCloseDate: date('expected_close_date'),
    actualCloseDate: date('actual_close_date'),
    closeReason: text('close_reason'),
    lossReason: text('loss_reason'),
    meetingLink: text('meeting_link'),
    meetingScheduledAt: timestamp('meeting_scheduled_at'),
    meetingNotes: text('meeting_notes'),
    aiDealAnalysis: jsonb('ai_deal_analysis').default(sql`'{}'::jsonb`),
    customFields: jsonb('custom_fields').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({
    orgStageIdx: index('idx_opportunities_org_stage').on(t.organizationId, t.stage),
  }),
);

export const opportunityStageHistory = pgTable('opportunity_stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  opportunityId: uuid('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  fromStage: text('from_stage'),
  toStage: text('to_stage').notNull(),
  changedByUserId: uuid('changed_by_user_id').references(() => users.id),
  changedByAgentId: uuid('changed_by_agent_id').references(() => agentProfiles.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// =====================================================================
// EMAIL INFRASTRUCTURE
// =====================================================================

export const emailDomains = pgTable('email_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  domainName: text('domain_name').notNull(),
  dnsVerified: boolean('dns_verified').notNull().default(false),
  spfVerified: boolean('spf_verified').notNull().default(false),
  dkimVerified: boolean('dkim_verified').notNull().default(false),
  dmarcVerified: boolean('dmarc_verified').notNull().default(false),
  warmupStatus: warmupStatusEnum('warmup_status').notNull().default('not_started'),
  warmupStartedAt: timestamp('warmup_started_at'),
  dailySendLimit: integer('daily_send_limit').notNull().default(50),
  reputationScore: real('reputation_score'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const emailAccounts = pgTable('email_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  domainId: uuid('domain_id').references(() => emailDomains.id, { onDelete: 'set null' }),
  agentId: uuid('agent_id').references(() => agentProfiles.id, { onDelete: 'set null' }),
  emailAddress: varchar('email_address', { length: 255 }).notNull(),
  displayName: text('display_name'),
  smtpConfig: jsonb('smtp_config'),
  imapConfig: jsonb('imap_config'),
  dailySendCount: integer('daily_send_count').notNull().default(0),
  dailySendLimit: integer('daily_send_limit').notNull().default(50),
  isActive: boolean('is_active').notNull().default(true),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// =====================================================================
// SYSTEM & AUDIT
// =====================================================================

export const providerSettings = pgTable(
  'provider_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    providerKey: text('provider_key').notNull(),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    encryptedSecrets: text('encrypted_secrets'),
    isActive: boolean('is_active').notNull().default(true),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    orgProviderUnique: uniqueIndex('provider_settings_org_provider_unique').on(
      t.organizationId,
      t.providerKey,
    ),
  }),
);

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull(),
  keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
  name: text('name').notNull(),
  permissions: text('permissions').array(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    agentId: uuid('agent_id').references(() => agentProfiles.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    changes: jsonb('changes').default(sql`'{}'::jsonb`),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_audit_log_org').on(t.organizationId, t.createdAt),
  }),
);

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  events: text('events').array(),
  secretHash: text('secret_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastTriggeredAt: timestamp('last_triggered_at'),
  failureCount: integer('failure_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const jobQueue = pgTable(
  'job_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    jobType: jobTypeEnum('job_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: jobStatusEnum('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(5),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    scheduledFor: timestamp('scheduled_for').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    pendingIdx: index('idx_job_queue_pending').on(t.scheduledFor, t.priority),
  }),
);

// =====================================================================
// WORKSPACE (STAGE-BY-STAGE AI CO-PILOT STATE)
// =====================================================================

export const workspaceStages = pgTable(
  'workspace_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    stageId: text('stage_id').notNull(),
    status: workspaceStageStatusEnum('status').notNull().default('in_progress'),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    version: integer('version').notNull().default(1),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    orgStageUnique: uniqueIndex('workspace_stages_org_stage_unique').on(
      t.organizationId,
      t.stageId,
    ),
  }),
);

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    stageId: text('stage_id').notNull(),
    role: assistantMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    proposedDraft: jsonb('proposed_draft'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    orgStageIdx: index('idx_assistant_messages_org_stage').on(
      t.organizationId,
      t.stageId,
      t.createdAt,
    ),
  }),
);

// =====================================================================
// TYPE EXPORTS
// =====================================================================

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type IdealCustomerProfile = typeof idealCustomerProfiles.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type AgentProfile = typeof agentProfiles.$inferSelect;
export type NewAgentProfile = typeof agentProfiles.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type CadenceStep = typeof cadenceSteps.$inferSelect;
export type CampaignLead = typeof campaignLeads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type WorkspaceStage = typeof workspaceStages.$inferSelect;
export type NewWorkspaceStage = typeof workspaceStages.$inferInsert;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type NewAssistantMessage = typeof assistantMessages.$inferInsert;
