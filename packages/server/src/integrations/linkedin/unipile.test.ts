import { describe, it, expect } from 'vitest';
import { extractPublicIdentifier, parseUnipileProfile } from './unipile.js';

describe('extractPublicIdentifier', () => {
  it('extracts from full LinkedIn URL', () => {
    expect(extractPublicIdentifier('https://www.linkedin.com/in/jane-doe')).toBe('jane-doe');
    expect(extractPublicIdentifier('https://linkedin.com/in/jane-doe/')).toBe('jane-doe');
  });

  it('handles URLs with query strings and fragments', () => {
    expect(extractPublicIdentifier('https://linkedin.com/in/jane-doe?utm=x#about')).toBe('jane-doe');
  });

  it('decodes URL-encoded identifiers', () => {
    expect(extractPublicIdentifier('https://linkedin.com/in/john%20smith')).toBe('john smith');
  });

  it('accepts a bare slug', () => {
    expect(extractPublicIdentifier('jane-doe')).toBe('jane-doe');
  });

  it('returns null for unrecognized URLs', () => {
    expect(extractPublicIdentifier('https://example.com/foo')).toBeNull();
    expect(extractPublicIdentifier('')).toBeNull();
  });
});

describe('parseUnipileProfile', () => {
  it('flattens a Unipile profile payload', () => {
    const result = parseUnipileProfile('https://linkedin.com/in/jane-doe', {
      public_identifier: 'jane-doe',
      first_name: 'Jane',
      last_name: 'Doe',
      headline: 'VP Engineering at Acme',
      industry: 'Software',
      location: 'San Francisco',
      summary: 'Builder of things',
      current_company: { name: 'Acme' },
      job_title: 'VP Engineering',
      work_experience: [
        { company: 'Acme', position: 'VP Eng', start: '2020', end: 'present' },
      ],
      education: [{ school: 'MIT', degree: 'BSc CS' }],
    });
    expect(result.firstName).toBe('Jane');
    expect(result.headline).toBe('VP Engineering at Acme');
    expect(result.bio).toBe('Builder of things');
    expect(result.experience?.[0]?.company).toBe('Acme');
    expect(result.education?.[0]?.school).toBe('MIT');
    expect(result.publicIdentifier).toBe('jane-doe');
  });
});
