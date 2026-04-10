import type { CRMProvider, CRMLead, CRMOpportunity } from '../types.js';

class StubCRMProvider implements CRMProvider {
  async syncLead(lead: CRMLead) {
    return { externalId: lead.externalId ?? `stub-${lead.id}` };
  }
  async syncOpportunity(opp: CRMOpportunity) {
    return { externalId: opp.externalId ?? `stub-${opp.id}` };
  }
  async pullLeads() {
    return [];
  }
}

let cached: CRMProvider | null = null;
export function getCRMProvider(): CRMProvider {
  if (!cached) cached = new StubCRMProvider();
  return cached;
}
