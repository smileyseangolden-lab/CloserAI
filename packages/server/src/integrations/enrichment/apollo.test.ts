import { describe, it, expect } from 'vitest';
import {
  buildOrgEnrichBody,
  buildPeopleMatchBody,
  parseOrgEnrichResponse,
  parsePeopleMatchResponse,
} from './apollo.js';

describe('apollo body builders', () => {
  it('builds an org enrich body with both name and domain', () => {
    const body = buildOrgEnrichBody('key', { companyName: 'Acme', domain: 'acme.com' });
    expect(body).toEqual({ api_key: 'key', domain: 'acme.com', organization_name: 'Acme' });
  });

  it('builds a people match body with name + domain', () => {
    const body = buildPeopleMatchBody('key', {
      firstName: 'Jane',
      lastName: 'Doe',
      companyDomain: 'acme.com',
    });
    expect(body.first_name).toBe('Jane');
    expect(body.last_name).toBe('Doe');
    expect(body.domain).toBe('acme.com');
    expect(body.reveal_personal_emails).toBe(false);
  });
});

describe('parseOrgEnrichResponse', () => {
  it('flattens an Apollo organization payload to canonical fields', () => {
    const result = parseOrgEnrichResponse({
      organization: {
        industry: 'Software',
        estimated_num_employees: 250,
        annual_revenue_printed: '$50M',
        city: 'San Francisco',
        state: 'CA',
        country: 'United States',
        short_description: 'A widget maker',
        technology_names: ['Salesforce', 'AWS'],
        primary_domain: 'acme.com',
      },
    });
    expect(result.industry).toBe('Software');
    expect(result.size).toBe('201-500');
    expect(result.location).toBe('San Francisco, CA, United States');
    expect(result.description).toBe('A widget maker');
    expect(result.technographics).toEqual({ tools: ['Salesforce', 'AWS'] });
    expect(result.firmographics?.domain).toBe('acme.com');
  });

  it('buckets employee counts correctly', () => {
    const small = parseOrgEnrichResponse({
      organization: { estimated_num_employees: 5 },
    });
    expect(small.size).toBe('1-10');
    const huge = parseOrgEnrichResponse({
      organization: { estimated_num_employees: 50000 },
    });
    expect(huge.size).toBe('5000+');
  });

  it('returns undefined fields gracefully on missing data', () => {
    const result = parseOrgEnrichResponse({});
    expect(result.industry).toBeUndefined();
    expect(result.size).toBeUndefined();
    expect(result.location).toBeUndefined();
  });
});

describe('parsePeopleMatchResponse', () => {
  it('maps a verified Apollo person', () => {
    const result = parsePeopleMatchResponse({
      person: {
        email: 'jane@acme.com',
        email_status: 'verified',
        first_name: 'Jane',
        last_name: 'Doe',
        title: 'VP Engineering',
        seniority: 'vp',
        departments: ['engineering'],
        linkedin_url: 'https://linkedin.com/in/janedoe',
        city: 'NYC',
        country: 'USA',
      },
    });
    expect(result.email).toBe('jane@acme.com');
    expect(result.emailVerified).toBe(true);
    expect(result.jobTitle).toBe('VP Engineering');
    expect(result.seniority).toBe('vp');
    expect(result.department).toBe('engineering');
    expect(result.location).toBe('NYC, USA');
  });

  it('reports unverified for non-verified email status', () => {
    const result = parsePeopleMatchResponse({
      person: { email: 'jane@acme.com', email_status: 'guess' },
    });
    expect(result.emailVerified).toBe(false);
  });
});
