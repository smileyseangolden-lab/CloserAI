import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY || 'missing-key',
});

export interface ClaudeCallOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  fast?: boolean;
}

/**
 * Single-turn Claude call that returns plain text.
 * If ANTHROPIC_API_KEY is missing (local dev with no key) this returns
 * a deterministic fake so tests and dev flows still work.
 */
export async function claude(
  prompt: string,
  options: ClaudeCallOptions = {},
): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }> {
  const model = options.fast ? env.ANTHROPIC_FAST_MODEL : env.ANTHROPIC_MODEL;

  if (!env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY missing — returning stub AI response');
    return {
      text: `[stub-ai-response] (model=${model}) ${prompt.slice(0, 120)}...`,
      inputTokens: 0,
      outputTokens: 0,
      model,
    };
  }

  const res = await anthropic.messages.create({
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

/**
 * Claude call that expects a JSON response. Extracts the first JSON
 * object from the response, falling back to the stub path if needed.
 */
export async function claudeJson<T = unknown>(
  prompt: string,
  options: ClaudeCallOptions = {},
): Promise<T> {
  const { text } = await claude(
    prompt +
      '\n\nRespond with ONLY valid JSON — no prose, no code fences, no commentary.',
    options,
  );

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Claude did not return JSON');
  }
  return JSON.parse(match[0]) as T;
}
