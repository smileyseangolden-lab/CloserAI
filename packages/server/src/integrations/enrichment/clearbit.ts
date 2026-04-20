import type {
  LeadEnrichmentProvider,
  EnrichmentInput,
  EnrichmentResult,
  ContactEnrichmentInput,
  ContactEnrichmentResult,
} from '../types.js';

/**
 * Clearbit (HubSpot) enrichment provider.
 * Docs: https://dashboard.clearbit.com/docs#enrichment-api-company-api
 *       https://dashboard.clearbit.com/docs#enrichment-api-person-api
 */
export class ClearbitEnrichmentProvider implements LeadEnrichmentProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('ClearbitEnrichmentProvider requires CLEARBIT_API_KEY');
  }

  async enrich(lead: EnrichmentInput): Promise<EnrichmentResult> {
    if (!lead.domain) {
      // Clearbit's company API is strictly domain-based.
      return { description: lead.companyName, raw: { reason: 'no domain' } };
    }
    const url = buildCompanyUrl(lead.domain);
    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 404) {
      return { description: lead.companyName, raw: { reason: 'not found' } };
    }
    if (res.status === 202) {
      // Clearbit queues the lookup; caller should retry later.
      return { description: lead.companyName, raw: { reason: 'queued' } };
    }
    if (!res.ok) {
      throw new Error(`Clearbit company failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as ClearbitCompany;
    return parseClearbitCompany(json);
  }

  async bulkEnrich(leads: EnrichmentInput[]): Promise<EnrichmentResult[]> {
    return Promise.all(leads.map((l) => this.enrich(l)));
  }

  async enrichContact(input: ContactEnrichmentInput): Promise<ContactEnrichmentResult> {
    if (!input.email) return { raw: { reason: 'no email' } };
    const url = `https://person.clearbit.com/v2/people/find?email=${encodeURIComponent(input.email)}`;
    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 404 || res.status === 202) {
      return { raw: { reason: res.status === 202 ? 'queued' : 'not found' } };
    }
    if (!res.ok) {
      throw new Error(`Clearbit person failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as ClearbitPerson;
    return parseClearbitPerson(json);
  }

  async checkCredits(): Promise<number> {
    return -1;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
  }
}

// ---------- Pure helpers (exported for tests) ----------

interface ClearbitCompany {
  name?: string;
  domain?: string;
  description?: string;
  category?: { industry?: string; sector?: string };
  metrics?: {
    employees?: number;
    employeesRange?: string;
    annualRevenue?: number;
    estimatedAnnualRevenue?: string;
  };
  geo?: { city?: string; state?: string; country?: string };
  tech?: string[];
  foundedYear?: number;
  linkedin?: { handle?: string };
}

interface ClearbitPerson {
  email?: string;
  name?: { givenName?: string; familyName?: string };
  employment?: { title?: string; seniority?: string; role?: string; subRole?: string };
  linkedin?: { handle?: string };
  twitter?: { handle?: string };
  bio?: string;
  geo?: { city?: string; state?: string; country?: string };
}

export function buildCompanyUrl(domain: string): string {
  return `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`;
}

export function parseClearbitCompany(json: ClearbitCompany): EnrichmentResult {
  const m = json.metrics ?? {};
  const location = [json.geo?.city, json.geo?.state, json.geo?.country]
    .filter(Boolean)
    .join(', ') || undefined;
  return {
    industry: json.category?.industry,
    size: m.employeesRange,
    revenueRange: m.estimatedAnnualRevenue,
    location,
    description: json.description,
    technographics: json.tech ? { tools: json.tech } : undefined,
    firmographics: {
      employees: m.employees,
      foundedYear: json.foundedYear,
      linkedinHandle: json.linkedin?.handle,
      domain: json.domain,
    },
    raw: json,
  };
}

export function parseClearbitPerson(json: ClearbitPerson): ContactEnrichmentResult {
  return {
    email: json.email,
    firstName: json.name?.givenName,
    lastName: json.name?.familyName,
    jobTitle: json.employment?.title,
    seniority: json.employment?.seniority,
    department: json.employment?.role,
    linkedinUrl: json.linkedin?.handle ? `https://linkedin.com/in/${json.linkedin.handle}` : undefined,
    twitterUrl: json.twitter?.handle ? `https://twitter.com/${json.twitter.handle}` : undefined,
    bio: json.bio,
    location: [json.geo?.city, json.geo?.state, json.geo?.country].filter(Boolean).join(', ') || undefined,
    raw: json,
  };
}
