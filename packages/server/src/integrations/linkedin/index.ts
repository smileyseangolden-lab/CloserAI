import type {
  LinkedInProvider,
  LinkedInProfile,
  LinkedInProfileFull,
  LinkedInActionResult,
  LinkedInAccountStatus,
} from '../types.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../../modules/admin/settingsService.js';
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

/**
 * Org-scoped LinkedIn provider. Pulls Unipile credentials and Proxycurl
 * scraping key from per-org settings (with env fallback).
 */
export async function getLinkedInProvider(orgId: string): Promise<LinkedInProvider> {
  const routing = await resolveProviderConfig(orgId, 'linkedin');
  const provider = (routing.values.provider as string) ?? 'stub';

  let messaging: LinkedInProvider;
  try {
    if (provider === 'unipile') {
      const cfg = await resolveProviderConfig(orgId, 'unipile');
      const dsn = cfg.values.dsn as string | undefined;
      const apiKey = cfg.values.apiKey as string | undefined;
      const accountId = cfg.values.accountId as string | undefined;
      if (dsn && apiKey && accountId) {
        messaging = new UnipileLinkedInProvider(dsn, apiKey, accountId);
      } else {
        logger.warn({ orgId }, 'Unipile selected but credentials incomplete; using stub');
        messaging = new StubLinkedInProvider();
      }
    } else {
      messaging = new StubLinkedInProvider();
    }
  } catch (err) {
    logger.warn({ err }, 'Falling back to stub LinkedIn provider');
    messaging = new StubLinkedInProvider();
  }

  const scrCfg = await resolveProviderConfig(orgId, 'proxycurl');
  const scraper = scrCfg.values.apiKey
    ? new ProxycurlScraper(scrCfg.values.apiKey as string)
    : null;

  return new LayeredLinkedInProvider(messaging, scraper);
}
