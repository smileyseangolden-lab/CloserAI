import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, 'migrations');

async function runRawSqlMigrations() {
  const entries = await fs.readdir(migrationsDir).catch(() => []);
  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();
  if (sqlFiles.length === 0) return;

  await pool.query(
    `CREATE TABLE IF NOT EXISTS _raw_sql_migrations (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  for (const file of sqlFiles) {
    const already = await pool.query(
      'SELECT 1 FROM _raw_sql_migrations WHERE filename = $1',
      [file],
    );
    if (already.rowCount && already.rowCount > 0) continue;

    const sqlText = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    logger.info({ file }, 'Applying raw SQL migration');
    await pool.query(sqlText);
    await pool.query('INSERT INTO _raw_sql_migrations (filename) VALUES ($1)', [file]);
  }
}

async function runMigrations() {
  logger.info('Running database migrations...');
  try {
    await runRawSqlMigrations();
    try {
      await migrate(db, { migrationsFolder: migrationsDir });
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('_journal.json') || msg.includes('ENOENT')) {
        logger.info('No drizzle-kit journal present, skipping generated migrations');
      } else {
        throw err;
      }
    }
    logger.info('Migrations completed successfully');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();
