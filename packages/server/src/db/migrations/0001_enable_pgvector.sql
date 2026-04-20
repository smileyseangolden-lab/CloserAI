-- Enables pgvector and adds a 1536-dim embedding column to agent_knowledge_base.
-- Dimension matches OpenAI text-embedding-3-small / ada-002 output; downstream
-- providers that emit fewer dims should pad on write.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE agent_knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE agent_knowledge_base
  ADD COLUMN IF NOT EXISTS embedding_model text;

ALTER TABLE agent_knowledge_base
  ADD COLUMN IF NOT EXISTS embedded_at timestamp;

CREATE INDEX IF NOT EXISTS agent_knowledge_base_embedding_idx
  ON agent_knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS agent_knowledge_base_agent_id_idx
  ON agent_knowledge_base (agent_id)
  WHERE is_active = true;
