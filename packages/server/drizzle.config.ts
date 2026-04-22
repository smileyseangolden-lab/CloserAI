import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://closerai:closerai_dev_password@localhost:5432/closerai',
  },
  // Exclude bookkeeping tables we manage by hand so drizzle-kit doesn't
  // treat them as "deleted" and prompt whether every new schema.ts table
  // is a rename of them. Without this, `db:migrate` hangs on a TTY prompt
  // for the very first additive change.
  tablesFilter: ['*', '!_raw_sql_migrations'],
  verbose: true,
  strict: true,
} satisfies Config;
