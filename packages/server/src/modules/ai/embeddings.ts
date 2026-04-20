import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { EMBEDDING_DIMENSIONS } from '../../db/schema.js';
import { resolveProviderConfig } from '../admin/settingsService.js';

export interface EmbeddingResult {
  vector: number[];
  model: string;
  inputTokens: number;
}

interface ResolvedEmbeddingsConfig {
  provider: 'stub' | 'openai' | 'voyage';
  model: string;
  openaiApiKey: string;
  voyageApiKey: string;
}

async function resolveConfig(orgId?: string): Promise<ResolvedEmbeddingsConfig> {
  if (orgId) {
    const c = await resolveProviderConfig(orgId, 'embeddings');
    return {
      provider:
        ((c.values.provider as string) || env.EMBEDDING_PROVIDER) as ResolvedEmbeddingsConfig['provider'],
      model: (c.values.model as string) || env.EMBEDDING_MODEL,
      openaiApiKey: (c.values.openaiApiKey as string) || env.OPENAI_API_KEY,
      voyageApiKey: (c.values.voyageApiKey as string) || env.VOYAGE_API_KEY,
    };
  }
  return {
    provider: env.EMBEDDING_PROVIDER,
    model: env.EMBEDDING_MODEL,
    openaiApiKey: env.OPENAI_API_KEY,
    voyageApiKey: env.VOYAGE_API_KEY,
  };
}

export async function embed(text: string, orgId?: string): Promise<EmbeddingResult> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) {
    return { vector: zeroVector(), model: 'empty', inputTokens: 0 };
  }
  const cfg = await resolveConfig(orgId);

  switch (cfg.provider) {
    case 'openai':
      if (!cfg.openaiApiKey) {
        logger.warn('embeddings provider=openai but no API key — using stub');
        return stubEmbed(clean);
      }
      return openaiEmbed(clean, cfg);
    case 'voyage':
      if (!cfg.voyageApiKey) {
        logger.warn('embeddings provider=voyage but no API key — using stub');
        return stubEmbed(clean);
      }
      return voyageEmbed(clean, cfg);
    case 'stub':
    default:
      return stubEmbed(clean);
  }
}

export async function embedBatch(texts: string[], orgId?: string): Promise<EmbeddingResult[]> {
  const out: EmbeddingResult[] = [];
  for (const t of texts) out.push(await embed(t, orgId));
  return out;
}

async function openaiEmbed(text: string, cfg: ResolvedEmbeddingsConfig): Promise<EmbeddingResult> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed (${res.status}): ${await res.text()}`);
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

async function voyageEmbed(text: string, cfg: ResolvedEmbeddingsConfig): Promise<EmbeddingResult> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.voyageApiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model === 'text-embedding-3-small' ? 'voyage-3' : cfg.model,
      input: [text],
      input_type: 'document',
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings failed (${res.status}): ${await res.text()}`);
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
