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

/**
 * Returns conservative results from the input so dev flows work without a key.
 */
export class StubEnrichmentProvider implements LeadEnrichmentProvider {
  async enrich(lead: EnrichmentInput): Promise<EnrichmentResult> {
    logger.debug({ lead }, '[stub] enrich');
    return {
      description: `${lead.companyName} — stub enrichment`,
      raw: { provider: 'stub', input: lead },
    };
  }
  async bulkEnrich(leads: EnrichmentInput[]): Promise<EnrichmentResult[]> {
    return Promise.all(leads.map((l) => this.enrich(l)));
  }
  async enrichContact(input: ContactEnrichmentInput): Promise<ContactEnrichmentResult> {
    return { firstName: input.firstName, lastName: input.lastName, email: input.email, raw: input };
  }
  async findEmail(input: EmailFinderInput): Promise<EmailFinderResult> {
    if (input.firstName && input.lastName) {
      return {
        email: `${input.firstName.toLowerCase()}.${input.lastName.toLowerCase()}@${input.domain}`,
        confidence: 0.5,
        raw: { provider: 'stub' },
      };
    }
    return { raw: { provider: 'stub' } };
  }
  async checkCredits(): Promise<number> {
    return 9999;
  }
}
