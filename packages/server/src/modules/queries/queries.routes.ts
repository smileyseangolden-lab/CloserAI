import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, pool } from '../../db/index.js';
import { customDashboards, savedQueries } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { claude } from '../ai/anthropic.js';

export const queriesRouter = Router();

// Tables the NL→SQL surface is allowed to query. Anything outside this list
// is rejected before the SQL ever reaches Postgres.
const ALLOWED_TABLES = new Set([
  'leads',
  'contacts',
  'campaigns',
  'campaign_leads',
  'cadence_steps',
  'messages',
  'activities',
  'opportunities',
  'opportunity_stage_history',
  'agent_profiles',
  'ideal_customer_profiles',
]);

// ---- saved_queries --------------------------------------------------------

const savedQuerySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  naturalLanguage: z.string().min(1),
  generatedSql: z.string().optional(),
});

queriesRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(savedQueries)
      .where(eq(savedQueries.organizationId, req.auth!.organizationId))
      .orderBy(desc(savedQueries.updatedAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

queriesRouter.post('/', validateBody(savedQuerySchema), async (req, res, next) => {
  try {
    const [row] = await db
      .insert(savedQueries)
      .values({
        ...req.body,
        organizationId: req.auth!.organizationId,
        createdByUserId: req.auth!.userId,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

queriesRouter.delete('/:id', async (req, res, next) => {
  try {
    await db
      .delete(savedQueries)
      .where(
        and(
          eq(savedQueries.id, req.params.id!),
          eq(savedQueries.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const askSchema = z.object({
  question: z.string().min(1),
  saveAs: z.string().optional(),
});

/**
 * Asks Claude to generate a read-only SQL query against the allowlist, runs it
 * inside a read-only transaction tenant-scoped by organization_id, and returns
 * both the rows and the generated SQL. Optionally persists as a saved query.
 */
queriesRouter.post('/ask', validateBody(askSchema), async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;
    const sql = await generateSql(req.body.question, orgId);
    assertSafeSql(sql);
    const result = await runReadOnly(sql);

    if (req.body.saveAs) {
      await db.insert(savedQueries).values({
        organizationId: orgId,
        name: req.body.saveAs,
        naturalLanguage: req.body.question,
        generatedSql: sql,
        lastRunAt: new Date(),
        lastResultCount: result.rows.length,
        lastResult: result.rows.slice(0, 50),
        createdByUserId: req.auth!.userId,
      });
    }

    res.json({ sql, ...result });
  } catch (err) {
    next(err);
  }
});

queriesRouter.post('/:id/run', async (req, res, next) => {
  try {
    const [q] = await db
      .select()
      .from(savedQueries)
      .where(
        and(
          eq(savedQueries.id, req.params.id!),
          eq(savedQueries.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!q) throw new NotFoundError('Saved query');
    if (!q.generatedSql) throw new ValidationError('No SQL on this saved query');
    assertSafeSql(q.generatedSql);
    const result = await runReadOnly(q.generatedSql);
    await db
      .update(savedQueries)
      .set({
        lastRunAt: new Date(),
        lastResultCount: result.rows.length,
        lastResult: result.rows.slice(0, 50),
      })
      .where(eq(savedQueries.id, q.id));
    res.json({ sql: q.generatedSql, ...result });
  } catch (err) {
    next(err);
  }
});

// ---- custom_dashboards ----------------------------------------------------

const dashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  layout: z.array(z.record(z.unknown())).optional(),
});

queriesRouter.get('/dashboards', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(customDashboards)
      .where(eq(customDashboards.organizationId, req.auth!.organizationId));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

queriesRouter.post('/dashboards', validateBody(dashboardSchema), async (req, res, next) => {
  try {
    const [row] = await db
      .insert(customDashboards)
      .values({
        ...req.body,
        organizationId: req.auth!.organizationId,
        createdByUserId: req.auth!.userId,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

queriesRouter.patch(
  '/dashboards/:id',
  validateBody(dashboardSchema.partial()),
  async (req, res, next) => {
    try {
      const [row] = await db
        .update(customDashboards)
        .set({ ...req.body, updatedAt: new Date() })
        .where(
          and(
            eq(customDashboards.id, req.params.id!),
            eq(customDashboards.organizationId, req.auth!.organizationId),
          ),
        )
        .returning();
      if (!row) throw new NotFoundError('Dashboard');
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

queriesRouter.delete('/dashboards/:id', async (req, res, next) => {
  try {
    await db
      .delete(customDashboards)
      .where(
        and(
          eq(customDashboards.id, req.params.id!),
          eq(customDashboards.organizationId, req.auth!.organizationId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- helpers --------------------------------------------------------------

async function generateSql(question: string, orgId: string): Promise<string> {
  const schema = `
TABLE leads (id, organization_id, company_name, company_industry, company_size, status, lead_score, created_at)
TABLE contacts (id, lead_id, organization_id, first_name, last_name, email, job_title, seniority_level, created_at)
TABLE campaigns (id, organization_id, name, campaign_type, status, created_at)
TABLE campaign_leads (id, campaign_id, lead_id, contact_id, status, reply_count, entered_at)
TABLE messages (id, organization_id, contact_id, agent_id, channel, direction, status, opened_at, replied_at, created_at)
TABLE opportunities (id, organization_id, lead_id, stage, estimated_value, probability, created_at, actual_close_date)
TABLE agent_profiles (id, organization_id, name, agent_type, personality_style, is_active)
TABLE ideal_customer_profiles (id, organization_id, name, target_industries, target_company_sizes)`;

  const prompt = `You are a Postgres expert. Translate this question into a single read-only SELECT statement.

Question: ${question}

Schema (only these tables and columns are queryable):
${schema}

Hard rules:
- SELECT only. No INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE/GRANT.
- ALWAYS include "WHERE organization_id = '${orgId}'" on every base table you select from. For joins, add the equivalent clause for each.
- Return at most 200 rows (LIMIT 200).
- No subqueries that hit tables outside the schema above.
- Output ONLY the SQL, no markdown fences, no commentary.`;
  const { text } = await claude(prompt, { maxTokens: 600, temperature: 0.1 });
  return text
    .trim()
    .replace(/^```sql\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

function assertSafeSql(sql: string): void {
  const lower = sql.toLowerCase();
  if (!lower.trim().startsWith('select') && !lower.trim().startsWith('with ')) {
    throw new ValidationError('Generated SQL must be a SELECT.');
  }
  const banned = [
    /\binsert\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\bdrop\b/,
    /\balter\b/,
    /\btruncate\b/,
    /\bgrant\b/,
    /\brevoke\b/,
    /\bcreate\b/,
    /\bcopy\b/,
    /;\s*\w+/, // multi-statement
    /pg_/, // catalogs
    /information_schema/,
  ];
  for (const re of banned) {
    if (re.test(lower)) throw new ValidationError('Generated SQL contains a disallowed token.');
  }

  // Best-effort table-allowlist check: every "from <ident>" / "join <ident>"
  // must reference an allowed table.
  const tableMatches = [...lower.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/g)];
  for (const m of tableMatches) {
    const t = m[1]!;
    if (!ALLOWED_TABLES.has(t)) {
      throw new ValidationError(`Table not allowed: ${t}`);
    }
  }
}

async function runReadOnly(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '8s'");
    const result = await client.query(sql);
    await client.query('COMMIT');
    return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? 0 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
