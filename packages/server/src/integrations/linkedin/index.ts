import type { LinkedInProvider, LinkedInProfile } from '../types.js';
import { logger } from '../../utils/logger.js';

class StubLinkedInProvider implements LinkedInProvider {
  async sendConnectionRequest(profile: LinkedInProfile, note: string) {
    logger.info({ profile: profile.profileUrl, note }, '[stub] LinkedIn connection');
    return { success: true };
  }
  async sendMessage(profile: LinkedInProfile, message: string) {
    logger.info({ profile: profile.profileUrl, message }, '[stub] LinkedIn message');
    return { success: true };
  }
  async scrapeProfile(url: string) {
    return { profileUrl: url };
  }
}

let cached: LinkedInProvider | null = null;
export function getLinkedInProvider(): LinkedInProvider {
  if (!cached) cached = new StubLinkedInProvider();
  return cached;
}
