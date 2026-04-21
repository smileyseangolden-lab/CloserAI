import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_PORT: z.coerce.number().default(4000),
  SERVER_URL: z.string().default('http://localhost:4000'),
  CLIENT_URL: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().default('postgresql://closerai:closerai_dev_password@localhost:5432/closerai'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(16).default('dev-secret-please-change-in-production-minimum-16-chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default('dev-encryption-key-32-bytes-long!!'),

  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-6'),
  ANTHROPIC_FAST_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  EMBEDDING_PROVIDER: z.enum(['stub', 'openai', 'voyage']).default('stub'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_API_KEY: z.string().default(''),
  VOYAGE_API_KEY: z.string().default(''),
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(5),

  // Enrichment
  ENRICHMENT_PROVIDER: z.enum(['stub', 'apollo', 'clearbit']).default('stub'),
  ENRICHMENT_FALLBACK_PROVIDER: z.enum(['stub', 'apollo', 'clearbit', 'none']).default('none'),
  APOLLO_API_KEY: z.string().default(''),
  CLEARBIT_API_KEY: z.string().default(''),
  HUNTER_API_KEY: z.string().default(''),

  // LinkedIn
  LINKEDIN_PROVIDER: z.enum(['stub', 'unipile']).default('stub'),
  UNIPILE_API_KEY: z.string().default(''),
  UNIPILE_DSN: z.string().default(''), // e.g. https://api1.unipile.com:13111
  UNIPILE_ACCOUNT_ID: z.string().default(''),
  PROXYCURL_API_KEY: z.string().default(''),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // Domain used in the Message-ID we stamp onto outbound email so inbound
  // webhooks can match replies back to the originating thread. In prod this
  // should be a domain you actually send from.
  OUTBOUND_MESSAGE_ID_DOMAIN: z.string().default('closerai.local'),

  // Shared secret for inbound webhook authentication. Providers that sign
  // requests (Postmark, SendGrid, Mailgun) should be verified with their
  // own signatures; this is the fallback for generic providers.
  INBOUND_WEBHOOK_SECRET: z.string().default(''),

  // Threshold over which we summarize old messages into a running memory.
  THREAD_SUMMARY_THRESHOLD: z.coerce.number().int().min(4).max(100).default(8),
  THREAD_SUMMARY_KEEP_RECENT: z.coerce.number().int().min(2).max(50).default(4),

  RATE_LIMIT_USER_PER_MIN: z.coerce.number().default(100),
  RATE_LIMIT_ORG_PER_MIN: z.coerce.number().default(1000),

  // CRM OAuth — per-provider client credentials. Fall back to admin
  // provider_settings overrides resolved via resolveProviderConfig().
  HUBSPOT_CLIENT_ID: z.string().default(''),
  HUBSPOT_CLIENT_SECRET: z.string().default(''),
  SALESFORCE_CLIENT_ID: z.string().default(''),
  SALESFORCE_CLIENT_SECRET: z.string().default(''),
  PIPEDRIVE_CLIENT_ID: z.string().default(''),
  PIPEDRIVE_CLIENT_SECRET: z.string().default(''),

  // How often the optimization scheduler runs (minutes). 0 disables it.
  OPTIMIZATION_SCHEDULER_INTERVAL_MIN: z.coerce.number().default(360),

  // How often the campaign tick looks for due cadence steps (milliseconds).
  // 0 disables the scheduler (useful in tests / one-off envs).
  CAMPAIGN_SCHEDULER_INTERVAL_MS: z.coerce.number().default(30_000),

  // How often the manager agents tick looks for due managers (milliseconds).
  MANAGER_SCHEDULER_INTERVAL_MS: z.coerce.number().default(600_000),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
