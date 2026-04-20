import { describe, it, expect } from 'vitest';
import { buildCompanyUrl, parseClearbitCompany, parseClearbitPerson } from './clearbit.js';

describe('buildCompanyUrl', () => {
  it('encodes the domain', () => {
    expect(buildCompanyUrl('acme.com')).toContain('domain=acme.com');
    expect(buildCompanyUrl('a&b.com')).toContain('domain=a%26b.com');
  });
});

describe('parseClearbitCompany', () => {
  it('flattens a Clearbit company payload', () => {
    const result = parseClearbitCompany({
      name: 'Acme',
      domain: 'acme.com',
      description: 'Widget maker',
      category: { industry: 'Software' },
      metrics: {
        employees: 200,
        employeesRange: '101-250',
        estimatedAnnualRevenue: '$10M-$50M',
      },
      geo: { city: 'SF', state: 'CA', country: 'USA' },
      tech: ['salesforce'],
      foundedYear: 2010,
      linkedin: { handle: 'company/acme' },
    });
    expect(result.industry).toBe('Software');
    expect(result.size).toBe('101-250');
    expect(result.revenueRange).toBe('$10M-$50M');
    expect(result.location).toBe('SF, CA, USA');
    expect(result.firmographics?.linkedinHandle).toBe('company/acme');
  });
});

describe('parseClearbitPerson', () => {
  it('produces full LinkedIn URL from handle', () => {
    const result = parseClearbitPerson({
      email: 'jane@acme.com',
      name: { givenName: 'Jane', familyName: 'Doe' },
      employment: { title: 'VP Eng', seniority: 'vp', role: 'engineering' },
      linkedin: { handle: 'janedoe' },
      twitter: { handle: 'janedoe' },
    });
    expect(result.linkedinUrl).toBe('https://linkedin.com/in/janedoe');
    expect(result.twitterUrl).toBe('https://twitter.com/janedoe');
    expect(result.firstName).toBe('Jane');
    expect(result.jobTitle).toBe('VP Eng');
    expect(result.department).toBe('engineering');
  });
});
