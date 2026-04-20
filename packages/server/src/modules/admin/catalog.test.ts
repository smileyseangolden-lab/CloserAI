import { describe, it, expect } from 'vitest';
import {
  PROVIDER_CATALOG,
  getProviderDefinition,
  partitionSettings,
  maskSecrets,
  maskValue,
  isSecretField,
} from './catalog.js';

describe('PROVIDER_CATALOG', () => {
  it('has unique provider keys', () => {
    const keys = PROVIDER_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every provider has at least one field', () => {
    for (const p of PROVIDER_CATALOG) {
      expect(p.fields.length).toBeGreaterThan(0);
    }
  });

  it('every field has a unique key within its provider', () => {
    for (const p of PROVIDER_CATALOG) {
      const fieldKeys = p.fields.map((f) => f.key);
      expect(new Set(fieldKeys).size).toBe(fieldKeys.length);
    }
  });

  it('covers the major sales integrations', () => {
    const required = ['anthropic', 'apollo', 'clearbit', 'hunter', 'unipile', 'proxycurl', 'smtp'];
    for (const k of required) {
      expect(getProviderDefinition(k), `missing ${k}`).toBeTruthy();
    }
  });
});

describe('partitionSettings', () => {
  it('separates secrets from non-secret settings', () => {
    const result = partitionSettings('apollo', { apiKey: 'sk-test' });
    expect(result.secrets.apiKey).toBe('sk-test');
    expect(result.settings.apiKey).toBeUndefined();
  });

  it('puts non-secret fields in settings', () => {
    const result = partitionSettings('embeddings', { provider: 'openai', model: 'foo' });
    expect(result.settings.provider).toBe('openai');
    expect(result.settings.model).toBe('foo');
    expect(result.secrets).toEqual({});
  });

  it('skips empty/null values', () => {
    const result = partitionSettings('apollo', { apiKey: '' });
    expect(result.secrets).toEqual({});
  });

  it('throws on unknown provider', () => {
    expect(() => partitionSettings('nope', {})).toThrow();
  });
});

describe('maskSecrets', () => {
  it('masks secret fields with last 4', () => {
    const r = maskSecrets('apollo', { apiKey: 'sk-test-1234567890' });
    expect(r.apiKey).toBe('••••7890');
  });

  it('does not mask non-secret fields', () => {
    const r = maskSecrets('embeddings', { provider: 'openai', openaiApiKey: 'sk-1234' });
    expect(r.provider).toBe('openai');
    expect(r.openaiApiKey).toBe('••••1234');
  });

  it('handles missing values', () => {
    const r = maskSecrets('apollo', {});
    expect(r.apiKey).toBeUndefined();
  });
});

describe('maskValue', () => {
  it('shows last 4', () => {
    expect(maskValue('sk-1234567890')).toBe('••••7890');
  });
  it('hides entirely when too short', () => {
    expect(maskValue('abc')).toBe('••••');
  });
});

describe('isSecretField', () => {
  it('true for password-type fields', () => {
    expect(isSecretField('apollo', 'apiKey')).toBe(true);
    expect(isSecretField('unipile', 'apiKey')).toBe(true);
  });
  it('false for non-secret fields', () => {
    expect(isSecretField('embeddings', 'provider')).toBe(false);
    expect(isSecretField('unipile', 'dsn')).toBe(false);
  });
});
