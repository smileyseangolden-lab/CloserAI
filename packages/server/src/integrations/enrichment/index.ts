import type {
  LeadEnrichmentProvider,
  EnrichmentInput,
  EnrichmentResult,
  ContactEnrichmentInput,
  ContactEnrichmentResult,
  EmailFinderInput,
  EmailFinderResult,
} from '../types.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { ApolloEnrichmentProvider } from './apollo.js';
import { ClearbitEnrichmentProvider } from './clearbit.js';
import { HunterEmailFinder } from './hunter.js';
import { StubEnrichmentProvider } from './stub.js';

type ProviderName = 'stub' | 'apollo' | 'clearbit';

function build(name: ProviderName): LeadEnrichmentProvider | null {
  try {
    switch (name) {
      case 'apollo':
        if (!env.APOLLO_API_KEY) return null;
        return new ApolloEnrichmentProvider(env.APOLLO_API_KEY);
      case 'clearbit':
        if (!env.CLEARBIT_API_KEY) return null;
        return new ClearbitEnrichmentProvider(env.CLEARBIT_API_KEY);
      case 'stub':
      default:
        return new StubEnrichmentProvider();
    }
  } catch (err) {
    logger.warn({ err, name }, 'Failed to construct enrichment provider');
    return null;
  }
}

/**
 * Layered enrichment: try the configured primary provider first, then the
 * fallback, then a stub. Hunter is layered on top for email-finding.
 */
class LayeredEnrichmentProvider implements LeadEnrichmentProvider {
  private hunter: HunterEmailFinder | null;
  constructor(
    private readonly primary: LeadEnrichmentProvider,
    private readonly fallback: LeadEnrichmentProvider | null,
  ) {
    this.hunter = env.HUNTER_API_KEY ? new HunterEmailFinder(env.HUNTER_API_KEY) : null;
  }

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
    // Apollo's people/match also returns an email when given name + domain.
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

let cached: LeadEnrichmentProvider | null = null;
export function getEnrichmentProvider(): LeadEnrichmentProvider {
  if (cached) return cached;
  const primary =
    build(env.ENRICHMENT_PROVIDER) ?? new StubEnrichmentProvider();
  const fallback =
    env.ENRICHMENT_FALLBACK_PROVIDER === 'none'
      ? null
      : build(env.ENRICHMENT_FALLBACK_PROVIDER as ProviderName);
  cached = new LayeredEnrichmentProvider(primary, fallback);
  return cached;
}

/** Test-only reset. */
export function _resetEnrichmentProviderCache() {
  cached = null;
}
