-- pgvector index for org-wide knowledge_base RAG retrieval (Stage 6).
-- ivfflat cosine; lists=100 is fine up to a few hundred thousand rows.

CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
  ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
