/**
 * Catalog of every external integration the platform talks to. Each provider
 * declares its configurable fields, which are secret, and which env var (if any)
 * acts as the global fallback when the org hasn't set its own value.
 *
 * The same catalog is served to the client to render the admin Integrations
 * page, and used on the server to validate writes and resolve effective config.
 */

export type FieldType = 'text' | 'password' | 'select' | 'number' | 'boolean' | 'url';

export interface ProviderField {
  key: string;
  label: string;
  type: FieldType;
  /** True for API keys, passwords, secrets — values returned to the client are masked. */
  secret?: boolean;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  /** Env var that supplies the fallback value when the org hasn't overridden. */
  envFallback?: string;
  /** Optional default when neither org nor env supplies a value. */
  default?: string | number | boolean;
}

export interface ProviderDefinition {
  key: string; // stable identifier persisted in DB
  name: string; // human-friendly label
  category: 'ai' | 'enrichment' | 'linkedin' | 'email' | 'crm' | 'general';
  vendor?: string;
  docsUrl?: string;
  description: string;
  fields: ProviderField[];
  /** True when this provider supports a `test` call. */
  testable?: boolean;
}

export const PROVIDER_CATALOG: ProviderDefinition[] = [
  // ---------- AI ----------
  {
    key: 'anthropic',
    name: 'Anthropic Claude',
    vendor: 'Anthropic',
    category: 'ai',
    docsUrl: 'https://docs.anthropic.com',
    description: 'Powers message generation, reply analysis, ICP refinement, deal scoring.',
    testable: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        secret: true,
        required: true,
        envFallback: 'ANTHROPIC_API_KEY',
        placeholder: 'sk-ant-...',
      },
      {
        key: 'model',
        label: 'Default model',
        type: 'text',
        envFallback: 'ANTHROPIC_MODEL',
        default: 'claude-opus-4-6',
      },
      {
        key: 'fastModel',
        label: 'Fast model (for short, low-latency calls)',
        type: 'text',
        envFallback: 'ANTHROPIC_FAST_MODEL',
        default: 'claude-haiku-4-5-20251001',
      },
    ],
  },
  {
    key: 'embeddings',
    name: 'Embeddings',
    category: 'ai',
    description: 'Vector embeddings for the RAG knowledge base.',
    testable: true,
    fields: [
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        envFallback: 'EMBEDDING_PROVIDER',
        default: 'stub',
        options: [
          { value: 'stub', label: 'Stub (deterministic, no key)' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'voyage', label: 'Voyage AI' },
        ],
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        envFallback: 'EMBEDDING_MODEL',
        default: 'text-embedding-3-small',
      },
      {
        key: 'openaiApiKey',
        label: 'OpenAI API key',
        type: 'password',
        secret: true,
        envFallback: 'OPENAI_API_KEY',
        description: 'Required when provider = openai.',
      },
      {
        key: 'voyageApiKey',
        label: 'Voyage API key',
        type: 'password',
        secret: true,
        envFallback: 'VOYAGE_API_KEY',
        description: 'Required when provider = voyage.',
      },
      {
        key: 'topK',
        label: 'Top-K retrieved snippets per generation',
        type: 'number',
        envFallback: 'RAG_TOP_K',
        default: 5,
      },
    ],
  },

  // ---------- Enrichment ----------
  {
    key: 'enrichment',
    name: 'Lead enrichment',
    category: 'enrichment',
    description: 'Routing layer that picks the active enrichment provider.',
    fields: [
      {
        key: 'provider',
        label: 'Primary provider',
        type: 'select',
        envFallback: 'ENRICHMENT_PROVIDER',
        default: 'stub',
        options: [
          { value: 'stub', label: 'Stub' },
          { value: 'apollo', label: 'Apollo.io' },
          { value: 'clearbit', label: 'Clearbit' },
        ],
      },
      {
        key: 'fallbackProvider',
        label: 'Fallback provider',
        type: 'select',
        envFallback: 'ENRICHMENT_FALLBACK_PROVIDER',
        default: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'stub', label: 'Stub' },
          { value: 'apollo', label: 'Apollo.io' },
          { value: 'clearbit', label: 'Clearbit' },
        ],
      },
    ],
  },
  {
    key: 'apollo',
    name: 'Apollo.io',
    vendor: 'Apollo',
    category: 'enrichment',
    docsUrl: 'https://docs.apollo.io',
    description: 'Company + people enrichment, email finder.',
    testable: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        secret: true,
        required: true,
        envFallback: 'APOLLO_API_KEY',
      },
    ],
  },
  {
    key: 'clearbit',
    name: 'Clearbit',
    vendor: 'HubSpot',
    category: 'enrichment',
    docsUrl: 'https://dashboard.clearbit.com/docs',
    description: 'Domain-based company + email-based person enrichment.',
    testable: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        secret: true,
        required: true,
        envFallback: 'CLEARBIT_API_KEY',
      },
    ],
  },
  {
    key: 'hunter',
    name: 'Hunter.io',
    vendor: 'Hunter',
    category: 'enrichment',
    docsUrl: 'https://hunter.io/api-documentation',
    description: 'Email finder + verifier, layered on top of any primary enrichment provider.',
    testable: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        secret: true,
        required: true,
        envFallback: 'HUNTER_API_KEY',
      },
    ],
  },

  // ---------- LinkedIn ----------
  {
    key: 'linkedin',
    name: 'LinkedIn routing',
    category: 'linkedin',
    description: 'Picks the active LinkedIn messaging provider.',
    fields: [
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        envFallback: 'LINKEDIN_PROVIDER',
        default: 'stub',
        options: [
          { value: 'stub', label: 'Stub (logs only)' },
          { value: 'unipile', label: 'Unipile' },
        ],
      },
    ],
  },
  {
    key: 'unipile',
    name: 'Unipile (LinkedIn)',
    vendor: 'Unipile',
    category: 'linkedin',
    docsUrl: 'https://developer.unipile.com',
    description: 'LinkedIn account automation: connection requests, messages, profile reads.',
    testable: true,
    fields: [
      {
        key: 'dsn',
        label: 'DSN',
        type: 'url',
        required: true,
        envFallback: 'UNIPILE_DSN',
        placeholder: 'https://api1.unipile.com:13111',
      },
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        secret: true,
        required: true,
        envFallback: 'UNIPILE_API_KEY',
      },
      {
        key: 'accountId',
        label: 'LinkedIn account ID',
        type: 'text',
        required: true,
        envFallback: 'UNIPILE_ACCOUNT_ID',
        description: 'The Unipile-issued ID for the connected LinkedIn account.',
      },
    ],
  },
  {
    key: 'proxycurl',
    name: 'Proxycurl',
    vendor: 'Nubela',
    category: 'linkedin',
    docsUrl: 'https://nubela.co/proxycurl/docs',
    description: 'Cached LinkedIn profile scraping. Used preferentially over LinkedIn for reads.',
    testable: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        secret: true,
        required: true,
        envFallback: 'PROXYCURL_API_KEY',
      },
    ],
  },

  // ---------- Email ----------
  {
    key: 'smtp',
    name: 'SMTP (outbound email)',
    category: 'email',
    description: 'Outbound email transport.',
    testable: true,
    fields: [
      { key: 'host', label: 'Host', type: 'text', envFallback: 'SMTP_HOST', placeholder: 'smtp.postmarkapp.com' },
      { key: 'port', label: 'Port', type: 'number', envFallback: 'SMTP_PORT', default: 587 },
      { key: 'user', label: 'Username', type: 'text', envFallback: 'SMTP_USER' },
      { key: 'password', label: 'Password', type: 'password', secret: true, envFallback: 'SMTP_PASSWORD' },
      { key: 'from', label: 'Default From address', type: 'text', envFallback: 'SMTP_FROM' },
    ],
  },
  {
    key: 'inboundEmail',
    name: 'Inbound email webhook',
    category: 'email',
    description:
      'Webhook ingest for replies. Configure your provider (Postmark/SendGrid/etc.) to POST to /api/v1/inbound/email.',
    fields: [
      {
        key: 'webhookSecret',
        label: 'Shared webhook secret',
        type: 'password',
        secret: true,
        envFallback: 'INBOUND_WEBHOOK_SECRET',
        description:
          'Sent as X-Webhook-Token by simple providers, or used as the HMAC key for X-Webhook-Signature.',
      },
      {
        key: 'outboundMessageIdDomain',
        label: 'Outbound Message-ID domain',
        type: 'text',
        envFallback: 'OUTBOUND_MESSAGE_ID_DOMAIN',
        default: 'closerai.local',
        description: 'Stamped into outbound Message-IDs so inbound replies can be threaded.',
      },
    ],
  },

  // ---------- CRM ----------
  {
    key: 'crm_hubspot',
    name: 'HubSpot',
    vendor: 'HubSpot',
    category: 'crm',
    docsUrl: 'https://developers.hubspot.com/docs/api/oauth',
    description: 'HubSpot CRM — OAuth app for push/pull sync of leads, contacts, deals.',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        type: 'text',
        envFallback: 'HUBSPOT_CLIENT_ID',
      },
      {
        key: 'clientSecret',
        label: 'Client secret',
        type: 'password',
        secret: true,
        envFallback: 'HUBSPOT_CLIENT_SECRET',
      },
    ],
  },
  {
    key: 'crm_salesforce',
    name: 'Salesforce',
    vendor: 'Salesforce',
    category: 'crm',
    docsUrl: 'https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm',
    description: 'Salesforce — Connected App for OAuth Web Server flow.',
    fields: [
      {
        key: 'clientId',
        label: 'Consumer Key',
        type: 'text',
        envFallback: 'SALESFORCE_CLIENT_ID',
      },
      {
        key: 'clientSecret',
        label: 'Consumer Secret',
        type: 'password',
        secret: true,
        envFallback: 'SALESFORCE_CLIENT_SECRET',
      },
    ],
  },
  {
    key: 'crm_pipedrive',
    name: 'Pipedrive',
    vendor: 'Pipedrive',
    category: 'crm',
    docsUrl: 'https://pipedrive.readme.io/docs/marketplace-oauth-authorization',
    description: 'Pipedrive — Marketplace OAuth app for push sync of deals & people.',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        type: 'text',
        envFallback: 'PIPEDRIVE_CLIENT_ID',
      },
      {
        key: 'clientSecret',
        label: 'Client secret',
        type: 'password',
        secret: true,
        envFallback: 'PIPEDRIVE_CLIENT_SECRET',
      },
    ],
  },

  // ---------- General ----------
  {
    key: 'general',
    name: 'AI generation tuning',
    category: 'general',
    description: 'Knobs that control how the message generator uses memory and retrieval.',
    fields: [
      {
        key: 'threadSummaryThreshold',
        label: 'Summarize threads longer than (messages)',
        type: 'number',
        envFallback: 'THREAD_SUMMARY_THRESHOLD',
        default: 8,
      },
      {
        key: 'threadSummaryKeepRecent',
        label: 'Keep this many recent messages verbatim',
        type: 'number',
        envFallback: 'THREAD_SUMMARY_KEEP_RECENT',
        default: 4,
      },
    ],
  },
];

const BY_KEY = new Map(PROVIDER_CATALOG.map((p) => [p.key, p]));

export function getProviderDefinition(key: string): ProviderDefinition | undefined {
  return BY_KEY.get(key);
}

export function isSecretField(providerKey: string, fieldKey: string): boolean {
  const def = BY_KEY.get(providerKey);
  return !!def?.fields.find((f) => f.key === fieldKey)?.secret;
}

export function partitionSettings(
  providerKey: string,
  payload: Record<string, unknown>,
): { settings: Record<string, unknown>; secrets: Record<string, string> } {
  const def = BY_KEY.get(providerKey);
  if (!def) throw new Error(`Unknown provider: ${providerKey}`);
  const settings: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  for (const field of def.fields) {
    if (!(field.key in payload)) continue;
    const value = payload[field.key];
    if (value === null || value === undefined || value === '') continue;
    if (field.secret) {
      secrets[field.key] = String(value);
    } else {
      settings[field.key] = value;
    }
  }
  return { settings, secrets };
}

/** Replaces secret values with a "•••• last4" mask suitable for the UI. */
export function maskSecrets(
  providerKey: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const def = BY_KEY.get(providerKey);
  if (!def) return values;
  const out: Record<string, unknown> = { ...values };
  for (const field of def.fields) {
    if (!field.secret) continue;
    const raw = values[field.key];
    if (typeof raw === 'string' && raw.length > 0) {
      out[field.key] = maskValue(raw);
    }
  }
  return out;
}

export function maskValue(raw: string): string {
  if (raw.length <= 4) return '••••';
  return `••••${raw.slice(-4)}`;
}
