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

  // Anthropic API keys live per-organization in the database (encrypted)
  // and are managed via Settings → Integrations in the UI. The env file
  // only holds the platform-wide default model identifiers.
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-6'),
  ANTHROPIC_FAST_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  RATE_LIMIT_USER_PER_MIN: z.coerce.number().default(100),
  RATE_LIMIT_ORG_PER_MIN: z.coerce.number().default(1000),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
