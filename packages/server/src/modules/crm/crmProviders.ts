/**
 * Per-provider CRM config — endpoints, scopes, local-field catalog, and the
 * remote field discovery strategy. Keeping it declarative makes adding a new
 * provider (Zoho, Copper, HighLevel, …) a ~40-line exercise.
 */

export type CrmProviderKey = 'hubspot' | 'salesforce' | 'pipedrive';

export interface CrmLocalField {
  key: string;
  label: string;
  /** Which CloserAI table + column this maps to (informational for the UI). */
  source: string;
}

export interface CrmProviderConfig {
  key: CrmProviderKey;
  name: string;
  docsUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  revokeUrl?: string;
  /** Default remote fields we know about when dynamic discovery is not wired. */
  defaultRemoteFields: Record<'lead' | 'contact' | 'opportunity', string[]>;
  /** Local fields exposed to the mapping UI, per entity. */
  localFields: Record<'lead' | 'contact' | 'opportunity', CrmLocalField[]>;
}

const LEAD_LOCAL_FIELDS: CrmLocalField[] = [
  { key: 'companyName', label: 'Company name', source: 'leads.company_name' },
  { key: 'companyWebsite', label: 'Website', source: 'leads.company_website' },
  { key: 'companyIndustry', label: 'Industry', source: 'leads.company_industry' },
  { key: 'companySize', label: 'Company size', source: 'leads.company_size' },
  { key: 'companyLocation', label: 'Location', source: 'leads.company_location' },
  { key: 'status', label: 'Status', source: 'leads.status' },
  { key: 'leadScore', label: 'Lead score', source: 'leads.lead_score' },
];

const CONTACT_LOCAL_FIELDS: CrmLocalField[] = [
  { key: 'firstName', label: 'First name', source: 'contacts.first_name' },
  { key: 'lastName', label: 'Last name', source: 'contacts.last_name' },
  { key: 'email', label: 'Email', source: 'contacts.email' },
  { key: 'phone', label: 'Phone', source: 'contacts.phone' },
  { key: 'jobTitle', label: 'Title', source: 'contacts.job_title' },
  { key: 'seniorityLevel', label: 'Seniority', source: 'contacts.seniority_level' },
  { key: 'linkedinUrl', label: 'LinkedIn', source: 'contacts.linkedin_url' },
];

const OPPORTUNITY_LOCAL_FIELDS: CrmLocalField[] = [
  { key: 'title', label: 'Deal title', source: 'opportunities.title' },
  { key: 'stage', label: 'Stage', source: 'opportunities.stage' },
  { key: 'estimatedValue', label: 'Value', source: 'opportunities.estimated_value' },
  { key: 'probability', label: 'Probability', source: 'opportunities.probability' },
  { key: 'expectedCloseDate', label: 'Expected close', source: 'opportunities.expected_close_date' },
];

export const CRM_PROVIDERS: Record<CrmProviderKey, CrmProviderConfig> = {
  hubspot: {
    key: 'hubspot',
    name: 'HubSpot',
    docsUrl: 'https://developers.hubspot.com/docs/api/oauth',
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: ['crm.objects.contacts.write', 'crm.objects.companies.write', 'crm.objects.deals.write'],
    defaultRemoteFields: {
      lead: ['name', 'domain', 'industry', 'numberofemployees', 'city', 'state'],
      contact: ['firstname', 'lastname', 'email', 'phone', 'jobtitle'],
      opportunity: ['dealname', 'dealstage', 'amount', 'closedate'],
    },
    localFields: {
      lead: LEAD_LOCAL_FIELDS,
      contact: CONTACT_LOCAL_FIELDS,
      opportunity: OPPORTUNITY_LOCAL_FIELDS,
    },
  },
  salesforce: {
    key: 'salesforce',
    name: 'Salesforce',
    docsUrl: 'https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm',
    authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token', 'offline_access'],
    revokeUrl: 'https://login.salesforce.com/services/oauth2/revoke',
    defaultRemoteFields: {
      lead: ['Name', 'Website', 'Industry', 'NumberOfEmployees', 'BillingCity'],
      contact: ['FirstName', 'LastName', 'Email', 'Phone', 'Title'],
      opportunity: ['Name', 'StageName', 'Amount', 'CloseDate', 'Probability'],
    },
    localFields: {
      lead: LEAD_LOCAL_FIELDS,
      contact: CONTACT_LOCAL_FIELDS,
      opportunity: OPPORTUNITY_LOCAL_FIELDS,
    },
  },
  pipedrive: {
    key: 'pipedrive',
    name: 'Pipedrive',
    docsUrl: 'https://pipedrive.readme.io/docs/marketplace-oauth-authorization',
    authorizeUrl: 'https://oauth.pipedrive.com/oauth/authorize',
    tokenUrl: 'https://oauth.pipedrive.com/oauth/token',
    scopes: ['deals:full', 'contacts:full', 'leads:full'],
    defaultRemoteFields: {
      lead: ['title', 'organization_id', 'label_ids', 'value'],
      contact: ['name', 'email', 'phone', 'org_id'],
      opportunity: ['title', 'value', 'stage_id', 'expected_close_date', 'probability'],
    },
    localFields: {
      lead: LEAD_LOCAL_FIELDS,
      contact: CONTACT_LOCAL_FIELDS,
      opportunity: OPPORTUNITY_LOCAL_FIELDS,
    },
  },
};

export function getCrmConfig(provider: CrmProviderKey): CrmProviderConfig {
  const cfg = CRM_PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown CRM provider: ${provider}`);
  return cfg;
}
