import type {
  LeadEnrichmentProvider,
  EnrichmentInput,
  EnrichmentResult,
  ContactEnrichmentInput,
  ContactEnrichmentResult,
  EmailFinderInput,
  EmailFinderResult,
} from '../types.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../../modules/admin/settingsService.js';
import { ApolloEnrichmentProvider } from './apollo.js';
import { ClearbitEnrichmentProvider } from './clearbit.js';
import { HunterEmailFinder } from './hunter.js';
import { StubEnrichmentProvider } from './stub.js';

type ProviderName = 'stub' | 'apollo' | 'clearbit';

async function buildProvider(
  orgId: string,
  name: ProviderName,
): Promise<LeadEnrichmentProvider | null> {
  try {
    switch (name) {
      case 'apollo': {
        const c = await resolveProviderConfig(orgId, 'apollo');
        const key = c.values.apiKey as string | undefined;
        return key ? new ApolloEnrichmentProvider(key) : null;
      }
      case 'clearbit': {
        const c = await resolveProviderConfig(orgId, 'clearbit');
        const key = c.values.apiKey as string | undefined;
        return key ? new ClearbitEnrichmentProvider(key) : null;
      }
      case 'stub':
      default:
        return new StubEnrichmentProvider();
    }
  } catch (err) {
    logger.warn({ err, name }, 'Failed to construct enrichment provider');
    return null;
  }
}

class LayeredEnrichmentProvider implements LeadEnrichmentProvider {
  constructor(
    private readonly primary: LeadEnrichmentProvider,
    private readonly fallback: LeadEnrichmentProvider | null,
    private readonly hunter: HunterEmailFinder | null,
  ) {}

  async enrich(lead: EnrichmentInput): Promise<EnrichmentResult> {
    try {
      const r = await this.primary.enrich(lead);
      if (hasUsefulCompanyData(r)) return r;
    } catch (err) {
      logger.warn({ err, companyName: lead.companyName }, 'Primary enrichment failed');
    }
    if (this.fallback) {
      try {
        return await this.fallback.enrich(lead);
      } catch (err) {
        logger.warn({ err }, 'Fallback enrichment failed');
      }
    }
    return { description: lead.companyName, raw: { provider: 'none' } };
  }

  async bulkEnrich(leads: EnrichmentInput[]): Promise<EnrichmentResult[]> {
    return Promise.all(leads.map((l) => this.enrich(l)));
  }

  async enrichContact(input: ContactEnrichmentInput): Promise<ContactEnrichmentResult> {
    const callers: Array<LeadEnrichmentProvider> = [this.primary];
    if (this.fallback) callers.push(this.fallback);
    for (const provider of callers) {
      if (!provider.enrichContact) continue;
      try {
        const r = await provider.enrichContact(input);
        if (r.email || r.jobTitle || r.linkedinUrl) return r;
      } catch (err) {
        logger.warn({ err }, 'Contact enrichment attempt failed');
      }
    }
    return { firstName: input.firstName, lastName: input.lastName, raw: { provider: 'none' } };
  }

  async findEmail(input: EmailFinderInput): Promise<EmailFinderResult> {
    if (this.hunter) {
      try {
        return await this.hunter.findEmail(input);
      } catch (err) {
        logger.warn({ err, domain: input.domain }, 'Hunter email finder failed');
      }
    }
    if (this.primary.enrichContact) {
      try {
        const r = await this.primary.enrichContact({
          firstName: input.firstName,
          lastName: input.lastName,
          companyDomain: input.domain,
        });
        if (r.email) {
          return { email: r.email, verified: r.emailVerified, raw: r.raw };
        }
      } catch (err) {
        logger.warn({ err }, 'Primary enrichContact email lookup failed');
      }
    }
    return { raw: { provider: 'none' } };
  }

  async checkCredits(): Promise<number> {
    return this.primary.checkCredits();
  }
}

function hasUsefulCompanyData(r: EnrichmentResult): boolean {
  return !!(r.industry || r.size || r.location || (r.description && r.description.length > 30));
}

/**
 * Returns an enrichment provider scoped to one org. Reads the org's settings
 * (or env fallback) on each call; settingsService caches the config for 60s
 * so this remains cheap.
 */
export async function getEnrichmentProvider(orgId: string): Promise<LeadEnrichmentProvider> {
  const routing = await resolveProviderConfig(orgId, 'enrichment');
  const primaryName = (routing.values.provider as ProviderName) ?? 'stub';
  const fallbackName = routing.values.fallbackProvider as ProviderName | 'none' | undefined;

  const primary = (await buildProvider(orgId, primaryName)) ?? new StubEnrichmentProvider();
  const fallback =
    fallbackName && fallbackName !== 'none' ? await buildProvider(orgId, fallbackName) : null;

  const hunterCfg = await resolveProviderConfig(orgId, 'hunter');
  const hunter = hunterCfg.values.apiKey
    ? new HunterEmailFinder(hunterCfg.values.apiKey as string)
    : null;

  return new LayeredEnrichmentProvider(primary, fallback, hunter);
}
