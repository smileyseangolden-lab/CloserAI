import type {
  LeadEnrichmentProvider,
  EnrichmentInput,
  EnrichmentResult,
  ContactEnrichmentInput,
  ContactEnrichmentResult,
} from '../types.js';
import { logger } from '../../utils/logger.js';

const APOLLO_BASE = 'https://api.apollo.io/v1';

/**
 * Apollo.io enrichment provider.
 * Docs: https://docs.apollo.io/reference/organization-enrichment
 *       https://docs.apollo.io/reference/people-enrichment
 *
 * Apollo's API key is sent in the JSON body as `api_key` for most endpoints.
 */
export class ApolloEnrichmentProvider implements LeadEnrichmentProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('ApolloEnrichmentProvider requires APOLLO_API_KEY');
  }

  async enrich(lead: EnrichmentInput): Promise<EnrichmentResult> {
    const body = buildOrgEnrichBody(this.apiKey, lead);
    const res = await fetch(`${APOLLO_BASE}/organizations/enrich`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Apollo org enrich failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as ApolloOrgEnrichResponse;
    return parseOrgEnrichResponse(json);
  }

  async bulkEnrich(leads: EnrichmentInput[]): Promise<EnrichmentResult[]> {
    // Apollo bulk endpoint accepts up to 10 organizations per call.
    const chunks: EnrichmentInput[][] = [];
    for (let i = 0; i < leads.length; i += 10) chunks.push(leads.slice(i, i + 10));

    const results: EnrichmentResult[] = [];
    for (const chunk of chunks) {
      const body = {
        api_key: this.apiKey,
        domains: chunk.map((l) => l.domain).filter((d): d is string => !!d),
      };
      const res = await fetch(`${APOLLO_BASE}/organizations/bulk_enrich`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        logger.warn(
          { status: res.status },
          'Apollo bulk enrich failed; falling back to per-lead calls',
        );
        for (const lead of chunk) results.push(await this.enrich(lead));
        continue;
      }
      const json = (await res.json()) as { organizations: ApolloOrganization[] };
      for (const org of json.organizations ?? []) {
        results.push(parseOrgEnrichResponse({ organization: org }));
      }
    }
    return results;
  }

  async enrichContact(input: ContactEnrichmentInput): Promise<ContactEnrichmentResult> {
    const body = buildPeopleMatchBody(this.apiKey, input);
    const res = await fetch(`${APOLLO_BASE}/people/match`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Apollo people match failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as ApolloPeopleMatchResponse;
    return parsePeopleMatchResponse(json);
  }

  async checkCredits(): Promise<number> {
    // Apollo doesn't expose a credits endpoint publicly; return a sentinel so
    // callers know the value is unknown rather than zero.
    return -1;
  }
}

// ---------- Pure helpers (exported for tests) ----------

interface ApolloOrganization {
  name?: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  annual_revenue_printed?: string;
  city?: string;
  state?: string;
  country?: string;
  short_description?: string;
  technology_names?: string[];
  founded_year?: number;
  linkedin_url?: string;
}

interface ApolloOrgEnrichResponse {
  organization?: ApolloOrganization;
}

interface ApolloPerson {
  email?: string;
  email_status?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  seniority?: string;
  departments?: string[];
  linkedin_url?: string;
  twitter_url?: string;
  city?: string;
  state?: string;
  country?: string;
  photo_url?: string;
  organization?: ApolloOrganization;
}

interface ApolloPeopleMatchResponse {
  person?: ApolloPerson;
}

export function buildOrgEnrichBody(apiKey: string, lead: EnrichmentInput) {
  return {
    api_key: apiKey,
    domain: lead.domain,
    organization_name: lead.companyName,
  };
}

export function buildPeopleMatchBody(apiKey: string, input: ContactEnrichmentInput) {
  return {
    api_key: apiKey,
    email: input.email,
    first_name: input.firstName,
    last_name: input.lastName,
    domain: input.companyDomain,
    linkedin_url: input.linkedinUrl,
    reveal_personal_emails: false,
  };
}

export function parseOrgEnrichResponse(json: ApolloOrgEnrichResponse): EnrichmentResult {
  const o = json.organization ?? {};
  const sizeBucket = bucketSize(o.estimated_num_employees);
  const location = [o.city, o.state, o.country].filter(Boolean).join(', ') || undefined;
  return {
    industry: o.industry,
    size: sizeBucket,
    revenueRange: o.annual_revenue_printed,
    location,
    description: o.short_description,
    technographics: o.technology_names ? { tools: o.technology_names } : undefined,
    firmographics: {
      employees: o.estimated_num_employees,
      foundedYear: o.founded_year,
      linkedinUrl: o.linkedin_url,
      domain: o.primary_domain,
    },
    raw: json,
  };
}

export function parsePeopleMatchResponse(
  json: ApolloPeopleMatchResponse,
): ContactEnrichmentResult {
  const p = json.person ?? {};
  return {
    email: p.email,
    emailVerified: p.email_status === 'verified',
    firstName: p.first_name,
    lastName: p.last_name,
    jobTitle: p.title,
    seniority: p.seniority,
    department: p.departments?.[0],
    linkedinUrl: p.linkedin_url,
    twitterUrl: p.twitter_url,
    location: [p.city, p.state, p.country].filter(Boolean).join(', ') || undefined,
    raw: json,
  };
}

function bucketSize(employees?: number): string | undefined {
  if (!employees || employees <= 0) return undefined;
  if (employees <= 10) return '1-10';
  if (employees <= 50) return '11-50';
  if (employees <= 200) return '51-200';
  if (employees <= 500) return '201-500';
  if (employees <= 1000) return '501-1000';
  if (employees <= 5000) return '1001-5000';
  return '5000+';
}

function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
  };
}
