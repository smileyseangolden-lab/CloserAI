import type { LinkedInProfileFull } from '../types.js';

/**
 * Proxycurl LinkedIn scraping for profile data only (no messaging).
 * Docs: https://nubela.co/proxycurl/docs#people-api-person-profile-endpoint
 */
export class ProxycurlScraper {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('ProxycurlScraper requires PROXYCURL_API_KEY');
  }

  async scrapeProfile(url: string): Promise<LinkedInProfileFull> {
    const params = new URLSearchParams({
      url,
      use_cache: 'if-present',
      fallback_to_cache: 'on-error',
    });
    const res = await fetch(`https://nubela.co/proxycurl/api/v2/linkedin?${params.toString()}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Proxycurl scrape failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as ProxycurlPerson;
    return parseProxycurlProfile(url, json);
  }
}

// ---------- Pure helpers (exported for tests) ----------

interface ProxycurlPerson {
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  headline?: string;
  occupation?: string;
  summary?: string;
  city?: string;
  state?: string;
  country?: string;
  industry?: string;
  experiences?: Array<{
    company?: string;
    title?: string;
    starts_at?: { year?: number; month?: number };
    ends_at?: { year?: number; month?: number } | null;
  }>;
  education?: Array<{ school?: string; degree_name?: string }>;
}

export function parseProxycurlProfile(
  url: string,
  json: ProxycurlPerson,
): LinkedInProfileFull {
  return {
    profileUrl: url,
    publicIdentifier: json.public_identifier,
    firstName: json.first_name,
    lastName: json.last_name,
    headline: json.headline ?? json.occupation,
    jobTitle: json.experiences?.[0]?.title,
    company: json.experiences?.[0]?.company,
    bio: json.summary,
    location: [json.city, json.state, json.country].filter(Boolean).join(', ') || undefined,
    industry: json.industry,
    experience: json.experiences?.map((e) => ({
      company: e.company ?? '',
      title: e.title ?? '',
      startDate: e.starts_at?.year ? String(e.starts_at.year) : undefined,
      endDate: e.ends_at?.year ? String(e.ends_at.year) : undefined,
    })),
    education: json.education?.map((e) => ({ school: e.school ?? '', degree: e.degree_name })),
    raw: json,
  };
}
