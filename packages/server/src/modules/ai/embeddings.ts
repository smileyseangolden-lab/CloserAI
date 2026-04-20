import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { EMBEDDING_DIMENSIONS } from '../../db/schema.js';

export interface EmbeddingResult {
  vector: number[];
  model: string;
  inputTokens: number;
}

export async function embed(text: string): Promise<EmbeddingResult> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) {
    return { vector: zeroVector(), model: 'empty', inputTokens: 0 };
  }

  switch (env.EMBEDDING_PROVIDER) {
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        logger.warn('EMBEDDING_PROVIDER=openai but OPENAI_API_KEY missing — using stub');
        return stubEmbed(clean);
      }
      return openaiEmbed(clean);
    case 'voyage':
      if (!env.VOYAGE_API_KEY) {
        logger.warn('EMBEDDING_PROVIDER=voyage but VOYAGE_API_KEY missing — using stub');
        return stubEmbed(clean);
      }
      return voyageEmbed(clean);
    case 'stub':
    default:
      return stubEmbed(clean);
  }
}

export async function embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
  // Simple sequential fallback; provider-specific batch APIs can be added later.
  const results: EmbeddingResult[] = [];
  for (const t of texts) {
    results.push(await embed(t));
  }
  return results;
}

async function openaiEmbed(text: string): Promise<EmbeddingResult> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[] }[];
    model: string;
    usage: { prompt_tokens: number };
  };
  const first = json.data[0];
  if (!first) throw new Error('OpenAI embeddings returned no data');
  return {
    vector: padOrTruncate(first.embedding, EMBEDDING_DIMENSIONS),
    model: json.model,
    inputTokens: json.usage?.prompt_tokens ?? 0,
  };
}

async function voyageEmbed(text: string): Promise<EmbeddingResult> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.EMBEDDING_MODEL === 'text-embedding-3-small' ? 'voyage-3' : env.EMBEDDING_MODEL,
      input: [text],
      input_type: 'document',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage embeddings failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[] }[];
    model: string;
    usage: { total_tokens: number };
  };
  const first = json.data[0];
  if (!first) throw new Error('Voyage embeddings returned no data');
  return {
    vector: padOrTruncate(first.embedding, EMBEDDING_DIMENSIONS),
    model: json.model,
    inputTokens: json.usage?.total_tokens ?? 0,
  };
}

// Deterministic hash-based pseudo-embedding so dev/test flows work without a key.
// Not semantically meaningful — only lexically stable.
function stubEmbed(text: string): EmbeddingResult {
  const vec = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    const h = crypto.createHash('sha256').update(token).digest();
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      const byte = h[i % h.length] ?? 0;
      vec[i] += (byte - 127.5) / 127.5;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return {
    vector: vec.map((v) => v / norm),
    model: 'stub-sha256',
    inputTokens: tokens.length,
  };
}

function zeroVector(): number[] {
  return new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
}

function padOrTruncate(vec: number[], target: number): number[] {
  if (vec.length === target) return vec;
  if (vec.length > target) return vec.slice(0, target);
  return vec.concat(new Array<number>(target - vec.length).fill(0));
}
