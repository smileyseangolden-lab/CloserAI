import type {
  LinkedInProvider,
  LinkedInProfile,
  LinkedInProfileFull,
  LinkedInActionResult,
  LinkedInAccountStatus,
} from '../types.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { UnipileLinkedInProvider } from './unipile.js';
import { ProxycurlScraper } from './proxycurl.js';

class StubLinkedInProvider implements LinkedInProvider {
  async sendConnectionRequest(profile: LinkedInProfile, note: string): Promise<LinkedInActionResult> {
    logger.info({ profile: profile.profileUrl, note }, '[stub] LinkedIn connection');
    return { success: true, externalId: `stub-${Date.now()}` };
  }
  async sendMessage(profile: LinkedInProfile, message: string): Promise<LinkedInActionResult> {
    logger.info({ profile: profile.profileUrl, message: message.slice(0, 80) }, '[stub] LinkedIn message');
    return { success: true, externalId: `stub-${Date.now()}` };
  }
  async scrapeProfile(url: string): Promise<LinkedInProfileFull> {
    return { profileUrl: url };
  }
  async accountStatus(): Promise<LinkedInAccountStatus> {
    return { connected: false, warnings: ['Using stub LinkedIn provider'] };
  }
}

/**
 * Layered provider: messaging via Unipile (or stub), profile-scrape preferring
 * Proxycurl (cheaper, cache-friendly) and falling back to the messaging provider.
 */
class LayeredLinkedInProvider implements LinkedInProvider {
  constructor(
    private readonly messaging: LinkedInProvider,
    private readonly scraper: ProxycurlScraper | null,
  ) {}

  sendConnectionRequest(profile: LinkedInProfile, note: string) {
    return this.messaging.sendConnectionRequest(profile, note);
  }

  sendMessage(profile: LinkedInProfile, message: string) {
    return this.messaging.sendMessage(profile, message);
  }

  async scrapeProfile(url: string): Promise<LinkedInProfileFull> {
    if (this.scraper) {
      try {
        return await this.scraper.scrapeProfile(url);
      } catch (err) {
        logger.warn({ err, url }, 'Proxycurl scrape failed, falling back to messaging provider');
      }
    }
    return this.messaging.scrapeProfile(url);
  }

  accountStatus() {
    return this.messaging.accountStatus?.() ?? Promise.resolve({ connected: false });
  }
}

let cached: LinkedInProvider | null = null;
export function getLinkedInProvider(): LinkedInProvider {
  if (cached) return cached;
  let messaging: LinkedInProvider;
  try {
    if (
      env.LINKEDIN_PROVIDER === 'unipile' &&
      env.UNIPILE_DSN &&
      env.UNIPILE_API_KEY &&
      env.UNIPILE_ACCOUNT_ID
    ) {
      messaging = new UnipileLinkedInProvider(
        env.UNIPILE_DSN,
        env.UNIPILE_API_KEY,
        env.UNIPILE_ACCOUNT_ID,
      );
    } else {
      messaging = new StubLinkedInProvider();
    }
  } catch (err) {
    logger.warn({ err }, 'Falling back to stub LinkedIn provider');
    messaging = new StubLinkedInProvider();
  }
  const scraper = env.PROXYCURL_API_KEY ? new ProxycurlScraper(env.PROXYCURL_API_KEY) : null;
  cached = new LayeredLinkedInProvider(messaging, scraper);
  return cached;
}

/** Test-only reset. */
export function _resetLinkedInProviderCache() {
  cached = null;
}
