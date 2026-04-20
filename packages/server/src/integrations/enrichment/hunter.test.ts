import { describe, it, expect } from 'vitest';
import { buildFinderUrl, parseFinderResponse } from './hunter.js';

describe('buildFinderUrl', () => {
  it('includes domain and api_key', () => {
    const url = buildFinderUrl('hk', { domain: 'acme.com' });
    expect(url).toContain('domain=acme.com');
    expect(url).toContain('api_key=hk');
  });

  it('passes first/last name when provided', () => {
    const url = buildFinderUrl('hk', { domain: 'acme.com', firstName: 'Jane', lastName: 'Doe' });
    expect(url).toContain('first_name=Jane');
    expect(url).toContain('last_name=Doe');
    expect(url).not.toContain('full_name=');
  });

  it('falls back to full_name only when first/last absent', () => {
    const url = buildFinderUrl('hk', { domain: 'acme.com', fullName: 'Jane Doe' });
    expect(url).toContain('full_name=Jane+Doe');
  });
});

describe('parseFinderResponse', () => {
  it('normalizes confidence to 0..1', () => {
    const r = parseFinderResponse({ data: { email: 'jane@acme.com', score: 87 } });
    expect(r.email).toBe('jane@acme.com');
    expect(r.confidence).toBeCloseTo(0.87);
  });

  it('reports verified when verification.status is valid', () => {
    const r = parseFinderResponse({
      data: { email: 'jane@acme.com', verification: { status: 'valid' } },
    });
    expect(r.verified).toBe(true);
  });

  it('returns undefined when no data', () => {
    const r = parseFinderResponse({});
    expect(r.email).toBeUndefined();
    expect(r.confidence).toBeUndefined();
  });
});
