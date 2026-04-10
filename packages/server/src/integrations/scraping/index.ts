import type {
  LeadScrapingProvider,
  ICPCriteria,
  CompanyResult,
  ContactResult,
} from '../types.js';

class StubScrapingProvider implements LeadScrapingProvider {
  async searchCompanies(_criteria: ICPCriteria): Promise<CompanyResult[]> {
    return [];
  }
  async searchContacts(_criteria: ICPCriteria): Promise<ContactResult[]> {
    return [];
  }
}

let cached: LeadScrapingProvider | null = null;
export function getScrapingProvider(): LeadScrapingProvider {
  if (!cached) cached = new StubScrapingProvider();
  return cached;
}
