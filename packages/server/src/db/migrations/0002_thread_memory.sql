-- Thread memory + inbound-matching indexes.
-- Adds a per-contact running conversation summary so the message generator
-- can reference long histories without stuffing every message into the prompt.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS conversation_summary text,
  ADD COLUMN IF NOT EXISTS conversation_summary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS conversation_summary_last_message_id uuid;

-- Inbound replies land here by external_message_id (the RFC 5322 Message-ID
-- that outbound mail stamped in). A unique index gives us natural dedup.
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_message_id_idx
  ON messages (external_message_id)
  WHERE external_message_id IS NOT NULL;

-- Contacts are matched on inbound by email address.
CREATE INDEX IF NOT EXISTS contacts_email_lower_idx
  ON contacts (lower(email));
