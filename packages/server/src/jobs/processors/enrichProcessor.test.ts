import { describe, it, expect } from 'vitest';
import { _internal } from './enrichProcessor.js';

const { extractDomain, normalizeSeniority } = _internal;

describe('extractDomain', () => {
  it('strips protocol and www', () => {
    expect(extractDomain('https://www.acme.com')).toBe('acme.com');
    expect(extractDomain('http://acme.com/path')).toBe('acme.com');
  });

  it('handles domain-only input', () => {
    expect(extractDomain('acme.com')).toBe('acme.com');
  });

  it('falls back to email domain when website is missing', () => {
    expect(extractDomain(undefined, 'jane@acme.com')).toBe('acme.com');
  });

  it('returns undefined when nothing parseable', () => {
    expect(extractDomain(undefined, undefined)).toBeUndefined();
    expect(extractDomain(undefined, 'not-an-email')).toBeUndefined();
  });
});

describe('normalizeSeniority', () => {
  it('maps founder/owner/chief to c_suite', () => {
    expect(normalizeSeniority('founder')).toBe('c_suite');
    expect(normalizeSeniority('Co-Owner')).toBe('c_suite');
    expect(normalizeSeniority('Chief Marketing Officer')).toBe('c_suite');
    expect(normalizeSeniority('CTO')).toBe('c_suite');
  });

  it('maps VP variants', () => {
    expect(normalizeSeniority('VP of Sales')).toBe('vp');
    expect(normalizeSeniority('Vice President, Marketing')).toBe('vp');
  });

  it('maps director / head_of', () => {
    expect(normalizeSeniority('Director')).toBe('director');
    expect(normalizeSeniority('Head of Growth')).toBe('director');
  });

  it('maps manager / lead', () => {
    expect(normalizeSeniority('Engineering Manager')).toBe('manager');
    expect(normalizeSeniority('Tech Lead')).toBe('manager');
  });

  it('maps senior tier', () => {
    expect(normalizeSeniority('Senior Engineer')).toBe('senior');
    expect(normalizeSeniority('Staff Engineer')).toBe('senior');
    expect(normalizeSeniority('Principal Engineer')).toBe('senior');
  });

  it('maps junior + intern', () => {
    expect(normalizeSeniority('Junior Designer')).toBe('junior');
    expect(normalizeSeniority('Intern')).toBe('intern');
  });

  it('returns undefined when input missing', () => {
    expect(normalizeSeniority(undefined)).toBeUndefined();
  });

  it('defaults to mid', () => {
    expect(normalizeSeniority('Engineer')).toBe('mid');
  });
});
