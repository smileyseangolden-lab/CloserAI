import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://closerai:closerai_dev_password@localhost:5432/closerai',
  },
  verbose: true,
  strict: true,
} satisfies Config;
