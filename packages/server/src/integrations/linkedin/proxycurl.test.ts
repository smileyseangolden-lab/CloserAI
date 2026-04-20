import { describe, it, expect } from 'vitest';
import { parseProxycurlProfile } from './proxycurl.js';

describe('parseProxycurlProfile', () => {
  it('flattens a Proxycurl person payload', () => {
    const result = parseProxycurlProfile('https://linkedin.com/in/jane-doe', {
      public_identifier: 'jane-doe',
      first_name: 'Jane',
      last_name: 'Doe',
      headline: 'VP Engineering',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
      industry: 'Software',
      summary: 'Builder',
      experiences: [
        {
          company: 'Acme',
          title: 'VP Eng',
          starts_at: { year: 2020 },
          ends_at: null,
        },
        {
          company: 'Beta',
          title: 'Senior Eng',
          starts_at: { year: 2015 },
          ends_at: { year: 2020 },
        },
      ],
      education: [{ school: 'MIT', degree_name: 'BSc CS' }],
    });
    expect(result.firstName).toBe('Jane');
    expect(result.location).toBe('San Francisco, CA, USA');
    expect(result.jobTitle).toBe('VP Eng'); // first experience
    expect(result.company).toBe('Acme');
    expect(result.experience?.[1]?.endDate).toBe('2020');
    expect(result.education?.[0]?.degree).toBe('BSc CS');
  });

  it('falls back to occupation when headline missing', () => {
    const result = parseProxycurlProfile('https://linkedin.com/in/x', {
      occupation: 'Founder at Acme',
    });
    expect(result.headline).toBe('Founder at Acme');
  });
});
