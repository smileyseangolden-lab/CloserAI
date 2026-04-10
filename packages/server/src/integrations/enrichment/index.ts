import type {
  LeadEnrichmentProvider,
  EnrichmentInput,
  EnrichmentResult,
} from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Stub enrichment provider. Returns a conservative result from the input
 * so dev flows work. Swap with ZoomInfo/Apollo/Clearbit in prod.
 */
class StubEnrichmentProvider implements LeadEnrichmentProvider {
  async enrich(lead: EnrichmentInput): Promise<EnrichmentResult> {
    logger.debug({ lead }, '[stub] enrich');
    return {
      industry: undefined,
      size: undefined,
      revenueRange: undefined,
      location: undefined,
      description: `${lead.companyName} — stub enrichment`,
      raw: { provider: 'stub', input: lead },
    };
  }
  async bulkEnrich(leads: EnrichmentInput[]): Promise<EnrichmentResult[]> {
    return Promise.all(leads.map((l) => this.enrich(l)));
  }
  async checkCredits(): Promise<number> {
    return 9999;
  }
}

let cached: LeadEnrichmentProvider | null = null;
export function getEnrichmentProvider(): LeadEnrichmentProvider {
  if (!cached) cached = new StubEnrichmentProvider();
  return cached;
}
