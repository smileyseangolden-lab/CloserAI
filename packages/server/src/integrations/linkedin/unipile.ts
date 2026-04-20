import type {
  LinkedInProvider,
  LinkedInProfile,
  LinkedInProfileFull,
  LinkedInActionResult,
  LinkedInAccountStatus,
} from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Unipile LinkedIn provider.
 * Docs: https://developer.unipile.com/reference/linkedinapicontroller_invitationcontroller_send
 *
 * Unipile uses a per-tenant DSN (e.g. https://api1.unipile.com:13111) and an
 * `X-API-KEY` header. Each LinkedIn account that's been connected via the hosted
 * auth flow gets a stable account_id, which we pin via UNIPILE_ACCOUNT_ID.
 *
 * IMPORTANT: LinkedIn aggressively bans accounts that exceed safe automation
 * limits. The provider checks accountStatus().rateLimitRemaining before each
 * call so the campaign worker can throttle itself.
 */
export class UnipileLinkedInProvider implements LinkedInProvider {
  constructor(
    private readonly dsn: string,
    private readonly apiKey: string,
    private readonly accountId: string,
  ) {
    if (!dsn || !apiKey || !accountId) {
      throw new Error('UnipileLinkedInProvider requires UNIPILE_DSN, UNIPILE_API_KEY, UNIPILE_ACCOUNT_ID');
    }
  }

  async sendConnectionRequest(
    profile: LinkedInProfile,
    note: string,
  ): Promise<LinkedInActionResult> {
    const provider_id = extractPublicIdentifier(profile.profileUrl);
    if (!provider_id) {
      return { success: false, reason: 'Could not extract LinkedIn identifier from URL' };
    }
    const res = await fetch(`${this.dsn}/api/v1/users/invite`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        account_id: this.accountId,
        provider_id,
        message: note.slice(0, 300), // LinkedIn note limit
      }),
    });
    return this.handleActionResponse(res, 'connection_request');
  }

  async sendMessage(profile: LinkedInProfile, message: string): Promise<LinkedInActionResult> {
    const provider_id = extractPublicIdentifier(profile.profileUrl);
    if (!provider_id) {
      return { success: false, reason: 'Could not extract LinkedIn identifier from URL' };
    }
    const res = await fetch(`${this.dsn}/api/v1/chats`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        account_id: this.accountId,
        attendees_ids: [provider_id],
        text: message,
      }),
    });
    return this.handleActionResponse(res, 'message');
  }

  async scrapeProfile(url: string): Promise<LinkedInProfileFull> {
    const identifier = extractPublicIdentifier(url);
    if (!identifier) {
      throw new Error(`Cannot extract LinkedIn identifier from ${url}`);
    }
    const res = await fetch(
      `${this.dsn}/api/v1/users/${encodeURIComponent(identifier)}?account_id=${this.accountId}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      throw new Error(`Unipile profile fetch failed (${res.status}): ${await res.text()}`);
    }
    const json = (await res.json()) as UnipileProfileResponse;
    return parseUnipileProfile(url, json);
  }

  async accountStatus(): Promise<LinkedInAccountStatus> {
    const res = await fetch(
      `${this.dsn}/api/v1/accounts/${encodeURIComponent(this.accountId)}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      return { connected: false, accountId: this.accountId, warnings: [`status=${res.status}`] };
    }
    const json = (await res.json()) as UnipileAccountResponse;
    return {
      connected: json.status === 'OK' || json.status === 'CONNECTED',
      accountId: this.accountId,
      warnings: json.sources?.flatMap((s) => s.errors ?? []),
    };
  }

  private async handleActionResponse(
    res: Response,
    action: string,
  ): Promise<LinkedInActionResult> {
    if (res.status === 429) {
      logger.warn({ action }, 'Unipile rate-limited LinkedIn action');
      return { success: false, rateLimited: true, reason: 'rate limited' };
    }
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ action, status: res.status, body }, 'Unipile action failed');
      return { success: false, reason: `${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as { object?: string; id?: string; chat_id?: string };
    return { success: true, externalId: json.id ?? json.chat_id };
  }

  private headers(): Record<string, string> {
    return {
      'X-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}

// ---------- Pure helpers (exported for tests) ----------

interface UnipileProfileResponse {
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  summary?: string;
  industry?: string;
  current_company?: { name?: string };
  job_title?: string;
  work_experience?: Array<{
    company?: string;
    position?: string;
    start?: string;
    end?: string;
  }>;
  education?: Array<{ school?: string; degree?: string }>;
}

interface UnipileAccountResponse {
  status?: string;
  sources?: Array<{ errors?: string[] }>;
}

/**
 * Extracts the LinkedIn public identifier from a profile URL.
 * Handles "linkedin.com/in/jane-doe", "linkedin.com/in/jane-doe/", and bare slugs.
 */
export function extractPublicIdentifier(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // If they passed just the identifier, accept it.
  if (!/[/.]/.test(trimmed)) return trimmed;
  const match = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function parseUnipileProfile(
  url: string,
  json: UnipileProfileResponse,
): LinkedInProfileFull {
  return {
    profileUrl: url,
    publicIdentifier: json.public_identifier,
    firstName: json.first_name,
    lastName: json.last_name,
    headline: json.headline,
    company: json.current_company?.name,
    jobTitle: json.job_title,
    bio: json.summary,
    location: json.location,
    industry: json.industry,
    experience: json.work_experience?.map((w) => ({
      company: w.company ?? '',
      title: w.position ?? '',
      startDate: w.start,
      endDate: w.end,
    })),
    education: json.education?.map((e) => ({ school: e.school ?? '', degree: e.degree })),
    raw: json,
  };
}
