-- Per-organization provider configuration. The `secrets` blob is
-- AES-256-GCM-encrypted at the application layer (see utils/crypto.ts) so
-- keys never sit in plaintext on disk. Non-secret config (model names, DSNs,
-- account IDs, send limits) lives in `settings` as plain JSONB.

CREATE TABLE IF NOT EXISTS provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_secrets text,
  is_active boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_key)
);

CREATE INDEX IF NOT EXISTS provider_settings_org_idx
  ON provider_settings (organization_id);
