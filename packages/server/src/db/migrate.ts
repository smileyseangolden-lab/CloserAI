import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { pool } from './index.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, 'migrations');
const serverRoot = path.resolve(__dirname, '..', '..');

/**
 * pgvector must exist before drizzle-kit push runs, because the
 * agent_knowledge_base.embedding column is declared as vector(1536).
 */
async function ensurePgvector() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  logger.info('pgvector extension ensured');
}

/**
 * Syncs every table in schema.ts to the database. On a fresh DB this creates
 * the entire schema; on an existing DB it applies additive changes.
 *
 * `--force` suppresses the "you are about to run destructive SQL" warning,
 * but drizzle-kit push *still* prompts interactively when it can't
 * automatically disambiguate a schema change (e.g. "is this a new table, or
 * was an existing one renamed?"). Those prompts default to the safe, purely
 * additive choice — "create table", "add column" — which is exactly what we
 * want for every additive change in this repo.
 *
 * We pipe a generous stream of newlines into the child's stdin to accept
 * every such default non-interactively. That keeps `npm run db:migrate`
 * runnable end-to-end inside Docker / CI without a TTY.
 */
async function drizzlePush() {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['drizzle-kit', 'push', '--force'], {
      cwd: serverRoot,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`drizzle-kit push exited ${code}`)),
    );

    if (child.stdin) {
      // 200 newlines covers many schema additions with plenty of headroom.
      // Writes that arrive before a prompt queue in stdin and are consumed
      // one-per-prompt; excess newlines are discarded when we end().
      child.stdin.write('\n'.repeat(200));
      child.stdin.end();
    }
  });
}

/**
 * Applies hand-written SQL overlays (indexes, ivfflat, triggers) that drizzle
 * can't express. Idempotent via the _raw_sql_migrations tracking table.
 */
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
  logger.info('Bootstrapping database...');
  try {
    await ensurePgvector();
    await drizzlePush();
    await runRawSqlMigrations();
    logger.info('Database ready');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();
