// =====================================================================
// Integration adapter contracts. Implementations live alongside this
// file (email/, enrichment/, linkedin/, crm/, calendar/, scraping/).
// Build orchestrates which concrete provider to use via env flags.
// =====================================================================

export interface EnrichmentInput {
  companyName: string;
  domain?: string;
  linkedinUrl?: string;
}

export interface EnrichmentResult {
  industry?: string;
  size?: string;
  revenueRange?: string;
  location?: string;
  description?: string;
  technographics?: Record<string, unknown>;
  firmographics?: Record<string, unknown>;
  raw: unknown;
}

export interface ContactEnrichmentInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
}

export interface ContactEnrichmentResult {
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  seniority?: string;
  department?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  bio?: string;
  location?: string;
  phone?: string;
  raw: unknown;
}

export interface EmailFinderInput {
  domain: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
}

export interface EmailFinderResult {
  email?: string;
  confidence?: number; // 0..1
  verified?: boolean;
  raw: unknown;
}

export interface LeadEnrichmentProvider {
  enrich(lead: EnrichmentInput): Promise<EnrichmentResult>;
  bulkEnrich(leads: EnrichmentInput[]): Promise<EnrichmentResult[]>;
  checkCredits(): Promise<number>;
  /** Optional: provider can also enrich a person record. */
  enrichContact?(input: ContactEnrichmentInput): Promise<ContactEnrichmentResult>;
  /** Optional: provider can find an email address from name + domain. */
  findEmail?(input: EmailFinderInput): Promise<EmailFinderResult>;
}

// ---- Email ----
export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
  accepted: boolean;
}

export interface DeliverabilityReport {
  domain: string;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  reputationScore?: number;
}

export interface InboundMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  messageId: string;
  inReplyTo?: string;
  threadId?: string;
  receivedAt: Date;
}

export interface EmailAccountConfig {
  emailAddress: string;
  smtp: { host: string; port: number; user: string; password: string };
  imap?: { host: string; port: number; user: string; password: string };
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
  checkDeliverability(domain: string): Promise<DeliverabilityReport>;
  syncInbox(account: EmailAccountConfig): Promise<InboundMessage[]>;
}

// ---- LinkedIn ----
export interface LinkedInProfile {
  profileUrl: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  company?: string;
}

export interface LinkedInProfileFull extends LinkedInProfile {
  bio?: string;
  location?: string;
  jobTitle?: string;
  industry?: string;
  experience?: Array<{ company: string; title: string; startDate?: string; endDate?: string }>;
  education?: Array<{ school: string; degree?: string }>;
  publicIdentifier?: string;
  raw?: unknown;
}

export interface LinkedInActionResult {
  success: boolean;
  externalId?: string;
  rateLimited?: boolean;
  reason?: string;
}

export interface LinkedInAccountStatus {
  connected: boolean;
  accountId?: string;
  rateLimitRemaining?: number;
  warnings?: string[];
}

export interface LinkedInProvider {
  sendConnectionRequest(
    profile: LinkedInProfile,
    note: string,
  ): Promise<LinkedInActionResult>;
  sendMessage(profile: LinkedInProfile, message: string): Promise<LinkedInActionResult>;
  scrapeProfile(url: string): Promise<LinkedInProfileFull>;
  /** Optional: returns account-level health so the campaign worker can pause sends. */
  accountStatus?(): Promise<LinkedInAccountStatus>;
}

// ---- CRM ----
export interface CRMLead {
  id: string;
  externalId?: string;
  companyName: string;
  contactEmail?: string;
  status: string;
}

export interface CRMOpportunity {
  id: string;
  externalId?: string;
  title: string;
  stage: string;
  value?: number;
}

export interface CRMProvider {
  syncLead(lead: CRMLead): Promise<{ externalId: string }>;
  syncOpportunity(opp: CRMOpportunity): Promise<{ externalId: string }>;
  pullLeads(filter: { updatedAfter?: Date; limit?: number }): Promise<CRMLead[]>;
}

// ---- Calendar ----
export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface MeetingRequest {
  organizerUserId: string;
  attendees: string[];
  subject: string;
  description?: string;
  start: Date;
  end: Date;
  timezone?: string;
}

export interface CalendarProvider {
  getAvailability(userId: string, range: { start: Date; end: Date }): Promise<TimeSlot[]>;
  createMeeting(
    meeting: MeetingRequest,
  ): Promise<{ meetingId: string; joinUrl?: string; htmlLink?: string }>;
}

// ---- Lead scraping ----
export interface ICPCriteria {
  industries?: string[];
  companySizes?: string[];
  geographies?: string[];
  titles?: string[];
  keywords?: string[];
  limit?: number;
}

export interface CompanyResult {
  companyName: string;
  domain?: string;
  industry?: string;
  size?: string;
  location?: string;
}

export interface ContactResult {
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedinUrl?: string;
  jobTitle?: string;
  companyName?: string;
}

export interface LeadScrapingProvider {
  searchCompanies(criteria: ICPCriteria): Promise<CompanyResult[]>;
  searchContacts(criteria: ICPCriteria): Promise<ContactResult[]>;
}
