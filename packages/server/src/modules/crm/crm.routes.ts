import { Router } from 'express';
import { and, eq, lt } from 'drizzle-orm';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  crmConnections,
  crmFieldMappings,
  crmOauthStates,
} from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../admin/settingsService.js';
import {
  CRM_PROVIDERS,
  getCrmConfig,
  type CrmProviderKey,
} from './crmProviders.js';

export const crmRouter = Router();

// ---- catalog --------------------------------------------------------------

crmRouter.get('/providers', (_req, res) => {
  res.json(
    Object.values(CRM_PROVIDERS).map((p) => ({
      key: p.key,
      name: p.name,
      docsUrl: p.docsUrl,
      scopes: p.scopes,
      entities: Object.keys(p.localFields),
    })),
  );
});

// ---- connections ----------------------------------------------------------

crmRouter.get('/connections', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.organizationId, req.auth!.organizationId));
    res.json(
      rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        status: r.status,
        accountId: r.accountId,
        accountName: r.accountName,
        scopes: r.scopes,
        expiresAt: r.expiresAt,
        lastSyncedAt: r.lastSyncedAt,
        lastError: r.lastError,
        hasTokens: !!r.encryptedTokens,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ---- OAuth: authorize URL -------------------------------------------------

const startSchema = z.object({
  provider: z.enum(['hubspot', 'salesforce', 'pipedrive']),
  redirectUri: z.string().url(),
});

crmRouter.post('/connect', validateBody(startSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof startSchema>;
    const cfg = getCrmConfig(body.provider);
    const creds = await resolveClientCredentials(body.provider, req.auth!.organizationId);
    if (!creds.clientId) {
      throw new ValidationError(
        `No ${cfg.name} client ID configured. Set it in Admin → Integrations.`,
      );
    }

    // Garbage-collect expired states before creating a new one.
    await db
      .delete(crmOauthStates)
      .where(lt(crmOauthStates.expiresAt, new Date()));

    const state = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.insert(crmOauthStates).values({
      organizationId: req.auth!.organizationId,
      provider: body.provider,
      state,
      userId: req.auth!.userId,
      redirectUri: body.redirectUri,
      expiresAt,
    });

    const authorizeUrl = new URL(cfg.authorizeUrl);
    authorizeUrl.searchParams.set('client_id', creds.clientId);
    authorizeUrl.searchParams.set('redirect_uri', body.redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', cfg.scopes.join(' '));
    authorizeUrl.searchParams.set('state', state);
    // Salesforce requires an extra flag to get a refresh token.
    if (body.provider === 'salesforce') authorizeUrl.searchParams.set('prompt', 'consent');

    res.json({ authorizeUrl: authorizeUrl.toString(), state, expiresAt });
  } catch (err) {
    next(err);
  }
});

// ---- OAuth: callback ------------------------------------------------------

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

crmRouter.post('/callback', validateBody(callbackSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof callbackSchema>;
    const [stateRow] = await db
      .select()
      .from(crmOauthStates)
      .where(eq(crmOauthStates.state, body.state))
      .limit(1);
    if (!stateRow) throw new ValidationError('Unknown or expired OAuth state');
    if (stateRow.expiresAt < new Date()) {
      await db.delete(crmOauthStates).where(eq(crmOauthStates.id, stateRow.id));
      throw new ValidationError('OAuth state expired');
    }
    if (stateRow.organizationId !== req.auth!.organizationId) {
      throw new ValidationError('State does not belong to this organisation');
    }

    const provider = stateRow.provider as CrmProviderKey;
    const cfg = getCrmConfig(provider);
    const creds = await resolveClientCredentials(provider, req.auth!.organizationId);
    if (!creds.clientId || !creds.clientSecret) {
      throw new ValidationError('Missing OAuth client credentials');
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri: stateRow.redirectUri,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!tokenRes.ok) {
      logger.warn({ provider, tokenJson }, 'OAuth token exchange failed');
      throw new ValidationError(
        `Token exchange failed: ${(tokenJson.error_description as string) ?? tokenRes.status}`,
      );
    }

    const accessToken = tokenJson.access_token as string | undefined;
    if (!accessToken) throw new ValidationError('No access_token in provider response');
    const refreshToken = (tokenJson.refresh_token as string) ?? null;
    const expiresIn =
      typeof tokenJson.expires_in === 'number' ? tokenJson.expires_in : undefined;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    const encrypted = encrypt(
      JSON.stringify({
        accessToken,
        refreshToken,
        tokenType: tokenJson.token_type ?? 'Bearer',
        instanceUrl: tokenJson.instance_url ?? null,
      }),
    );

    // Upsert the connection per (orgId, provider).
    const [existing] = await db
      .select()
      .from(crmConnections)
      .where(
        and(
          eq(crmConnections.organizationId, req.auth!.organizationId),
          eq(crmConnections.provider, provider),
        ),
      )
      .limit(1);

    const accountMeta = (tokenJson as { hub_id?: string | number; id?: string; instance_url?: string });
    const accountId =
      (accountMeta.hub_id !== undefined ? String(accountMeta.hub_id) : undefined) ??
      accountMeta.id ??
      accountMeta.instance_url ??
      null;

    let connectionId: string;
    if (existing) {
      await db
        .update(crmConnections)
        .set({
          status: 'connected',
          accountId,
          scopes: cfg.scopes,
          encryptedTokens: encrypted,
          expiresAt,
          lastError: null,
          connectedByUserId: req.auth!.userId,
          updatedAt: new Date(),
        })
        .where(eq(crmConnections.id, existing.id));
      connectionId = existing.id;
    } else {
      const [created] = await db
        .insert(crmConnections)
        .values({
          organizationId: req.auth!.organizationId,
          provider,
          status: 'connected',
          accountId,
          scopes: cfg.scopes,
          encryptedTokens: encrypted,
          expiresAt,
          connectedByUserId: req.auth!.userId,
        })
        .returning({ id: crmConnections.id });
      connectionId = created!.id;
    }

    await db.delete(crmOauthStates).where(eq(crmOauthStates.id, stateRow.id));
    res.status(201).json({ id: connectionId, provider, status: 'connected' });
  } catch (err) {
    next(err);
  }
});

// ---- disconnect -----------------------------------------------------------

crmRouter.post('/connections/:id/disconnect', async (req, res, next) => {
  try {
    const [row] = await db
      .update(crmConnections)
      .set({
        status: 'disconnected',
        encryptedTokens: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(crmConnections.id, req.params.id!),
          eq(crmConnections.organizationId, req.auth!.organizationId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError('Connection');
    res.json({ id: row.id, status: row.status });
  } catch (err) {
    next(err);
  }
});

// ---- field discovery ------------------------------------------------------

crmRouter.get('/connections/:id/fields', async (req, res, next) => {
  try {
    const [conn] = await db
      .select()
      .from(crmConnections)
      .where(
        and(
          eq(crmConnections.id, req.params.id!),
          eq(crmConnections.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!conn) throw new NotFoundError('Connection');
    const cfg = getCrmConfig(conn.provider as CrmProviderKey);
    res.json({
      local: cfg.localFields,
      remote: cfg.defaultRemoteFields,
    });
  } catch (err) {
    next(err);
  }
});

// ---- mappings -------------------------------------------------------------

const mappingSchema = z.object({
  entity: z.string().min(1),
  localField: z.string().min(1),
  remoteField: z.string().min(1),
  direction: z.enum(['push', 'pull', 'both']).optional(),
  transform: z.string().optional(),
  isRequired: z.boolean().optional(),
});

crmRouter.get('/connections/:id/mappings', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(crmFieldMappings)
      .where(eq(crmFieldMappings.connectionId, req.params.id!));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const bulkMappingSchema = z.object({
  mappings: z.array(mappingSchema),
});

crmRouter.put(
  '/connections/:id/mappings',
  validateBody(bulkMappingSchema),
  async (req, res, next) => {
    try {
      const connId = req.params.id!;
      const [conn] = await db
        .select()
        .from(crmConnections)
        .where(
          and(
            eq(crmConnections.id, connId),
            eq(crmConnections.organizationId, req.auth!.organizationId),
          ),
        )
        .limit(1);
      if (!conn) throw new NotFoundError('Connection');

      await db.delete(crmFieldMappings).where(eq(crmFieldMappings.connectionId, connId));
      const body = req.body as z.infer<typeof bulkMappingSchema>;
      if (body.mappings.length === 0) return res.json([]);
      const created = await db
        .insert(crmFieldMappings)
        .values(body.mappings.map((m) => ({ ...m, connectionId: connId })))
        .returning();
      res.json(created);
    } catch (err) {
      next(err);
    }
  },
);

// ---- test push ------------------------------------------------------------

crmRouter.post('/connections/:id/test-push', async (req, res, next) => {
  try {
    const [conn] = await db
      .select()
      .from(crmConnections)
      .where(
        and(
          eq(crmConnections.id, req.params.id!),
          eq(crmConnections.organizationId, req.auth!.organizationId),
        ),
      )
      .limit(1);
    if (!conn) throw new NotFoundError('Connection');
    if (conn.status !== 'connected' || !conn.encryptedTokens) {
      throw new ValidationError('Connection is not connected');
    }
    let tokens;
    try {
      tokens = JSON.parse(decrypt(conn.encryptedTokens)) as {
        accessToken: string;
        instanceUrl?: string | null;
      };
    } catch {
      throw new ValidationError('Failed to decrypt tokens');
    }

    const mappings = await db
      .select()
      .from(crmFieldMappings)
      .where(eq(crmFieldMappings.connectionId, conn.id));

    // Dry-run: we only resolve the endpoint URL and echo back the payload we
    // *would* POST, so users can validate mappings without creating records.
    const samplePayload = buildSamplePayload(conn.provider as CrmProviderKey, mappings);
    const endpoint = pushEndpoint(conn.provider as CrmProviderKey, 'lead', tokens.instanceUrl);

    await db
      .update(crmConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(crmConnections.id, conn.id));

    res.json({
      endpoint,
      payload: samplePayload,
      note: 'Dry run only. No record was created in the remote CRM.',
    });
  } catch (err) {
    next(err);
  }
});

// ---- helpers --------------------------------------------------------------

async function resolveClientCredentials(
  provider: CrmProviderKey,
  orgId: string,
): Promise<{ clientId: string; clientSecret: string }> {
  const providerKey = `crm_${provider}`;
  try {
    const c = await resolveProviderConfig(orgId, providerKey);
    return {
      clientId: (c.values.clientId as string) || envClientId(provider),
      clientSecret: (c.values.clientSecret as string) || envClientSecret(provider),
    };
  } catch {
    return { clientId: envClientId(provider), clientSecret: envClientSecret(provider) };
  }
}

function envClientId(provider: CrmProviderKey): string {
  if (provider === 'hubspot') return env.HUBSPOT_CLIENT_ID;
  if (provider === 'salesforce') return env.SALESFORCE_CLIENT_ID;
  return env.PIPEDRIVE_CLIENT_ID;
}
function envClientSecret(provider: CrmProviderKey): string {
  if (provider === 'hubspot') return env.HUBSPOT_CLIENT_SECRET;
  if (provider === 'salesforce') return env.SALESFORCE_CLIENT_SECRET;
  return env.PIPEDRIVE_CLIENT_SECRET;
}

function pushEndpoint(
  provider: CrmProviderKey,
  entity: 'lead' | 'contact' | 'opportunity',
  instanceUrl?: string | null,
): string {
  if (provider === 'hubspot') {
    const objectPath = { lead: 'companies', contact: 'contacts', opportunity: 'deals' }[entity];
    return `https://api.hubapi.com/crm/v3/objects/${objectPath}`;
  }
  if (provider === 'salesforce') {
    const sObject = { lead: 'Lead', contact: 'Contact', opportunity: 'Opportunity' }[entity];
    return `${instanceUrl ?? 'https://<instance>.salesforce.com'}/services/data/v60.0/sobjects/${sObject}`;
  }
  // Pipedrive
  const objectPath = { lead: 'organizations', contact: 'persons', opportunity: 'deals' }[entity];
  return `https://api.pipedrive.com/v1/${objectPath}`;
}

function buildSamplePayload(
  provider: CrmProviderKey,
  mappings: Array<{ entity: string; localField: string; remoteField: string }>,
): Record<string, unknown> {
  const leadMappings = mappings.filter((m) => m.entity === 'lead');
  const sample: Record<string, unknown> = {};
  for (const m of leadMappings) {
    sample[m.remoteField] = `{{ ${m.localField} }}`;
  }
  if (provider === 'hubspot') return { properties: sample };
  return sample;
}
