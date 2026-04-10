import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import { logger } from '../utils/logger.js';

async function runMigrations() {
  logger.info('Running database migrations...');
  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    logger.info('Migrations completed successfully');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();
