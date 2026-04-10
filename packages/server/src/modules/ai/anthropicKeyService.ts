import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { organizations } from '../../db/schema.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/**
 * Per-organization Anthropic API key management.
 *
 * Keys live encrypted in `organizations.encrypted_anthropic_api_key` and are
 * rotated via Settings → Integrations in the UI. Decrypted plaintext is
 * cached in memory for CACHE_TTL_MS so the hot path (campaign workers,
 * reply analysis) doesn't hit the DB on every call.
 *
 * When a key is saved or cleared, call `invalidateAnthropicKey(orgId)` to
 * drop the cache entry — that's how the "update from UI, take effect
 * immediately" contract is honored without a server restart.
 */

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { key: string | null; expiresAt: number }>();

export async function getAnthropicKeyForOrg(organizationId: string): Promise<string | null> {
  const cached = cache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  const [org] = await db
    .select({ encrypted: organizations.encryptedAnthropicApiKey })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org?.encrypted) {
    cache.set(organizationId, { key: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }

  try {
    const plaintext = decrypt(org.encrypted);
    cache.set(organizationId, { key: plaintext, expiresAt: Date.now() + CACHE_TTL_MS });
    return plaintext;
  } catch (err) {
    logger.error({ err, organizationId }, 'Failed to decrypt Anthropic key');
    cache.set(organizationId, { key: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
}

/**
 * Persists a new Anthropic API key for the org. Stores the encrypted blob,
 * the first 11 chars as a non-secret identifier, and the update timestamp.
 * Invalidates the in-memory cache so subsequent calls pick up the new key
 * without needing a process restart.
 */
export async function setAnthropicKeyForOrg(
  organizationId: string,
  plaintextKey: string,
): Promise<{ prefix: string; updatedAt: Date }> {
  const trimmed = plaintextKey.trim();
  if (!trimmed.startsWith('sk-ant-')) {
    throw new AppError(
      'Invalid Anthropic API key format — expected prefix "sk-ant-"',
      422,
      'INVALID_API_KEY',
    );
  }

  const encrypted = encrypt(trimmed);
  const prefix = trimmed.slice(0, 11);
  const updatedAt = new Date();

  await db
    .update(organizations)
    .set({
      encryptedAnthropicApiKey: encrypted,
      anthropicApiKeyPrefix: prefix,
      anthropicApiKeyUpdatedAt: updatedAt,
      updatedAt,
    })
    .where(eq(organizations.id, organizationId));

  invalidateAnthropicKey(organizationId);
  logger.info({ organizationId, prefix }, 'Anthropic API key rotated');

  return { prefix, updatedAt };
}

export async function clearAnthropicKeyForOrg(organizationId: string): Promise<void> {
  await db
    .update(organizations)
    .set({
      encryptedAnthropicApiKey: null,
      anthropicApiKeyPrefix: null,
      anthropicApiKeyUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  invalidateAnthropicKey(organizationId);
  logger.info({ organizationId }, 'Anthropic API key cleared');
}

export async function getAnthropicKeyStatus(organizationId: string) {
  const [org] = await db
    .select({
      prefix: organizations.anthropicApiKeyPrefix,
      updatedAt: organizations.anthropicApiKeyUpdatedAt,
      encrypted: organizations.encryptedAnthropicApiKey,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return {
    isConfigured: !!org?.encrypted,
    keyPrefix: org?.prefix ?? null,
    updatedAt: org?.updatedAt ?? null,
  };
}

export function invalidateAnthropicKey(organizationId: string) {
  cache.delete(organizationId);
}

/**
 * Test that a key actually works by making a cheap 1-token Claude call.
 * Used by the UI "Test connection" button before saving.
 */
export async function testAnthropicKey(plaintextKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: plaintextKey });
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
