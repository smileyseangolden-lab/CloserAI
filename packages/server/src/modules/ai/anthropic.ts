import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../admin/settingsService.js';

export interface ClaudeCallOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  fast?: boolean;
  /** Resolves API key + model from this org's settings; falls back to env. */
  orgId?: string;
}

interface ResolvedClaudeConfig {
  apiKey: string;
  model: string;
  fastModel: string;
}

async function resolveConfig(orgId?: string): Promise<ResolvedClaudeConfig> {
  if (orgId) {
    const c = await resolveProviderConfig(orgId, 'anthropic');
    return {
      apiKey: (c.values.apiKey as string) || env.ANTHROPIC_API_KEY,
      model: (c.values.model as string) || env.ANTHROPIC_MODEL,
      fastModel: (c.values.fastModel as string) || env.ANTHROPIC_FAST_MODEL,
    };
  }
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL,
    fastModel: env.ANTHROPIC_FAST_MODEL,
  };
}

/**
 * Single-turn Claude call. When `orgId` is provided, looks up the org's
 * configured API key and model overrides.
 */
export async function claude(
  prompt: string,
  options: ClaudeCallOptions = {},
): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }> {
  const cfg = await resolveConfig(options.orgId);
  const model = options.fast ? cfg.fastModel : cfg.model;

  if (!cfg.apiKey) {
    logger.warn('No Anthropic API key — returning stub AI response');
    return {
      text: `[stub-ai-response] (model=${model}) ${prompt.slice(0, 120)}...`,
      inputTokens: 0,
      outputTokens: 0,
      model,
    };
  }

  const client = new Anthropic({ apiKey: cfg.apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
    system: options.system,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    model,
  };
}

export async function claudeJson<T = unknown>(
  prompt: string,
  options: ClaudeCallOptions = {},
): Promise<T> {
  const { text } = await claude(
    prompt + '\n\nRespond with ONLY valid JSON — no prose, no code fences, no commentary.',
    options,
  );
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude did not return JSON');
  return JSON.parse(match[0]) as T;
}
