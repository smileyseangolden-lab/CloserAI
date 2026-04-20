import type { EmailFinderInput, EmailFinderResult } from '../types.js';

/**
 * Hunter.io email finder + verifier.
 * Docs: https://hunter.io/api-documentation/v2#email-finder
 *       https://hunter.io/api-documentation/v2#email-verifier
 */
export class HunterEmailFinder {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('HunterEmailFinder requires HUNTER_API_KEY');
  }

  async findEmail(input: EmailFinderInput): Promise<EmailFinderResult> {
    const url = buildFinderUrl(this.apiKey, input);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Hunter finder failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as HunterFinderResponse;
    return parseFinderResponse(json);
  }

  async verifyEmail(email: string): Promise<{ valid: boolean; score: number; raw: unknown }> {
    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${this.apiKey}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Hunter verifier failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as HunterVerifyResponse;
    return {
      valid: json.data?.status === 'valid',
      score: (json.data?.score ?? 0) / 100,
      raw: json,
    };
  }
}

// ---------- Pure helpers (exported for tests) ----------

interface HunterFinderResponse {
  data?: {
    email?: string;
    score?: number; // 0..100
    verification?: { status?: string };
  };
}

interface HunterVerifyResponse {
  data?: {
    status?: string;
    score?: number;
  };
}

export function buildFinderUrl(apiKey: string, input: EmailFinderInput): string {
  const params = new URLSearchParams({ domain: input.domain, api_key: apiKey });
  if (input.firstName) params.set('first_name', input.firstName);
  if (input.lastName) params.set('last_name', input.lastName);
  if (input.fullName && !input.firstName && !input.lastName) {
    params.set('full_name', input.fullName);
  }
  return `https://api.hunter.io/v2/email-finder?${params.toString()}`;
}

export function parseFinderResponse(json: HunterFinderResponse): EmailFinderResult {
  const d = json.data ?? {};
  return {
    email: d.email,
    confidence: d.score != null ? d.score / 100 : undefined,
    verified: d.verification?.status === 'valid',
    raw: json,
  };
}
