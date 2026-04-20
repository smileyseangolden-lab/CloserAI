import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { providerSettings } from '../../db/schema.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  PROVIDER_CATALOG,
  getProviderDefinition,
  maskSecrets,
  partitionSettings,
} from './catalog.js';

export interface ResolvedConfig<T = Record<string, unknown>> {
  providerKey: string;
  /** Final values, plain (decrypted) — for use server-side. */
  values: T;
  /** Where each field's value came from. */
  source: Record<string, 'org' | 'env' | 'default' | 'missing'>;
}

interface CacheEntry {
  values: Record<string, unknown>;
  source: Record<string, 'org' | 'env' | 'default' | 'missing'>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(orgId: string, providerKey: string): string {
  return `${orgId}::${providerKey}`;
}

export function invalidateProviderCache(orgId: string, providerKey?: string) {
  if (providerKey) {
    cache.delete(cacheKey(orgId, providerKey));
  } else {
    for (const k of cache.keys()) if (k.startsWith(`${orgId}::`)) cache.delete(k);
  }
}

/**
 * Returns the effective configuration for a provider in this org. Resolution
 * priority per field: org-stored value → env fallback → catalog default →
 * undefined. Cached for 60s; the cache is invalidated on writes.
 */
export async function resolveProviderConfig<T = Record<string, unknown>>(
  orgId: string,
  providerKey: string,
): Promise<ResolvedConfig<T>> {
  const def = getProviderDefinition(providerKey);
  if (!def) throw new Error(`Unknown provider: ${providerKey}`);

  const cached = cache.get(cacheKey(orgId, providerKey));
  if (cached && cached.expiresAt > Date.now()) {
    return { providerKey, values: cached.values as T, source: cached.source };
  }

  const [row] = await db
    .select()
    .from(providerSettings)
    .where(
      and(
        eq(providerSettings.organizationId, orgId),
        eq(providerSettings.providerKey, providerKey),
      ),
    )
    .limit(1);

  let orgValues: Record<string, unknown> = {};
  if (row?.isActive) {
    orgValues = { ...(row.settings as Record<string, unknown>) };
    if (row.encryptedSecrets) {
      try {
        const secrets = JSON.parse(decrypt(row.encryptedSecrets)) as Record<string, string>;
        Object.assign(orgValues, secrets);
      } catch (err) {
        logger.error({ err, orgId, providerKey }, 'Failed to decrypt provider secrets');
      }
    }
  }

  const values: Record<string, unknown> = {};
  const source: Record<string, 'org' | 'env' | 'default' | 'missing'> = {};

  for (const field of def.fields) {
    if (field.key in orgValues && orgValues[field.key] !== '' && orgValues[field.key] != null) {
      values[field.key] = orgValues[field.key];
      source[field.key] = 'org';
      continue;
    }
    if (field.envFallback) {
      const envValue = (env as unknown as Record<string, unknown>)[field.envFallback];
      if (envValue !== undefined && envValue !== '') {
        values[field.key] = envValue;
        source[field.key] = 'env';
        continue;
      }
    }
    if (field.default !== undefined) {
      values[field.key] = field.default;
      source[field.key] = 'default';
      continue;
    }
    source[field.key] = 'missing';
  }

  cache.set(cacheKey(orgId, providerKey), {
    values,
    source,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return { providerKey, values: values as T, source };
}

/**
 * Returns one redacted view of every provider for the admin UI: the saved
 * non-secret values are returned as-is, secrets are returned as "•••• last4"
 * if set (org or env), and the source of each field is reported so the UI can
 * indicate "inherited from env" badges.
 */
export async function listProviderSettingsForOrg(orgId: string) {
  const result: Array<{
    providerKey: string;
    values: Record<string, unknown>;
    source: Record<string, 'org' | 'env' | 'default' | 'missing'>;
    hasOrgOverride: boolean;
    updatedAt?: string;
  }> = [];

  const rows = await db
    .select()
    .from(providerSettings)
    .where(eq(providerSettings.organizationId, orgId));
  const byKey = new Map(rows.map((r) => [r.providerKey, r]));

  for (const def of PROVIDER_CATALOG) {
    const resolved = await resolveProviderConfig(orgId, def.key);
    const masked = maskSecrets(def.key, resolved.values);
    const row = byKey.get(def.key);
    result.push({
      providerKey: def.key,
      values: masked,
      source: resolved.source,
      hasOrgOverride: !!row && row.isActive,
      updatedAt: row?.updatedAt?.toISOString(),
    });
  }
  return result;
}

/**
 * Upserts the provider settings for an org. Empty/null values mean "remove this
 * field"; missing fields are preserved (so the UI can submit only changed
 * fields without wiping secrets).
 */
export async function upsertProviderSettings(args: {
  orgId: string;
  providerKey: string;
  payload: Record<string, unknown>;
  userId: string;
  isActive?: boolean;
}) {
  const def = getProviderDefinition(args.providerKey);
  if (!def) throw new Error(`Unknown provider: ${args.providerKey}`);

  const existing = await db
    .select()
    .from(providerSettings)
    .where(
      and(
        eq(providerSettings.organizationId, args.orgId),
        eq(providerSettings.providerKey, args.providerKey),
      ),
    )
    .limit(1);

  const prior = existing[0];
  const priorSettings = (prior?.settings as Record<string, unknown> | undefined) ?? {};
  const priorSecrets: Record<string, string> = prior?.encryptedSecrets
    ? safeDecryptJson(prior.encryptedSecrets)
    : {};

  const { settings: newSettings, secrets: newSecrets } = partitionSettings(
    args.providerKey,
    args.payload,
  );

  // Merge: explicit empty string in payload removes the field; absent fields
  // preserve the prior value.
  const mergedSettings: Record<string, unknown> = { ...priorSettings };
  for (const field of def.fields.filter((f) => !f.secret)) {
    if (field.key in args.payload) {
      const v = args.payload[field.key];
      if (v === '' || v === null) {
        delete mergedSettings[field.key];
      } else {
        mergedSettings[field.key] = newSettings[field.key];
      }
    }
  }

  const mergedSecrets: Record<string, string> = { ...priorSecrets };
  for (const field of def.fields.filter((f) => f.secret)) {
    if (field.key in args.payload) {
      const v = args.payload[field.key];
      if (v === '' || v === null) {
        delete mergedSecrets[field.key];
      } else if (typeof v === 'string' && !isMasked(v)) {
        // Any masked value (•••• prefix) is the UI returning what we sent it,
        // not a new secret — ignore so we don't overwrite the real key with a mask.
        mergedSecrets[field.key] = newSecrets[field.key]!;
      }
    }
  }

  const encryptedSecrets =
    Object.keys(mergedSecrets).length > 0 ? encrypt(JSON.stringify(mergedSecrets)) : null;

  if (prior) {
    await db
      .update(providerSettings)
      .set({
        settings: mergedSettings,
        encryptedSecrets,
        isActive: args.isActive ?? prior.isActive,
        updatedByUserId: args.userId,
        updatedAt: new Date(),
      })
      .where(eq(providerSettings.id, prior.id));
  } else {
    await db.insert(providerSettings).values({
      organizationId: args.orgId,
      providerKey: args.providerKey,
      settings: mergedSettings,
      encryptedSecrets,
      isActive: args.isActive ?? true,
      updatedByUserId: args.userId,
    });
  }

  invalidateProviderCache(args.orgId, args.providerKey);
}

export async function deleteProviderSettings(orgId: string, providerKey: string) {
  await db
    .delete(providerSettings)
    .where(
      and(
        eq(providerSettings.organizationId, orgId),
        eq(providerSettings.providerKey, providerKey),
      ),
    );
  invalidateProviderCache(orgId, providerKey);
}

function safeDecryptJson(blob: string): Record<string, string> {
  try {
    return JSON.parse(decrypt(blob)) as Record<string, string>;
  } catch (err) {
    logger.error({ err }, 'Failed to decrypt prior secrets blob');
    return {};
  }
}

export function isMasked(value: string): boolean {
  return value.startsWith('••••');
}
