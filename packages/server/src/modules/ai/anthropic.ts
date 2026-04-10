import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { getAnthropicKeyForOrg } from './anthropicKeyService.js';

export interface ClaudeCallOptions {
  organizationId: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  fast?: boolean;
}

/**
 * We intentionally do NOT maintain a singleton Anthropic client anymore.
 * Every call resolves the key for the requesting organization, so rotating
 * a key in the UI takes effect on the very next AI request — no restart,
 * no hot reload, no env editing.
 */
async function getClientForOrg(organizationId: string): Promise<Anthropic | null> {
  const key = await getAnthropicKeyForOrg(organizationId);
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

/**
 * Single-turn Claude call that returns plain text.
 *
 * If the org has no Anthropic key configured yet, this returns a clearly
 * labeled stub response so dev flows still work. Production callers should
 * check `isStub` in the returned object if they need to gate behavior.
 */
export async function claude(
  prompt: string,
  options: ClaudeCallOptions,
): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  isStub: boolean;
}> {
  const model = options.fast ? env.ANTHROPIC_FAST_MODEL : env.ANTHROPIC_MODEL;
  const client = await getClientForOrg(options.organizationId);

  if (!client) {
    logger.warn(
      { organizationId: options.organizationId },
      'No Anthropic API key configured for org — returning stub response',
    );
    return {
      text: `[stub-ai-response] (model=${model}) ${prompt.slice(0, 120)}...`,
      inputTokens: 0,
      outputTokens: 0,
      model,
      isStub: true,
    };
  }

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
    isStub: false,
  };
}

/**
 * Claude call that expects a JSON response. Extracts the first JSON
 * object from the response, and throws if the org has no key (the caller
 * should typically surface this as a 412 to prompt the user to configure
 * their key in Settings → Integrations).
 */
export async function claudeJson<T = unknown>(
  prompt: string,
  options: ClaudeCallOptions,
): Promise<T> {
  const { text, isStub } = await claude(
    prompt +
      '\n\nRespond with ONLY valid JSON — no prose, no code fences, no commentary.',
    options,
  );

  if (isStub) {
    throw new AppError(
      'Anthropic API key not configured for this organization. Set one in Settings → Integrations.',
      412,
      'ANTHROPIC_KEY_MISSING',
    );
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Claude did not return JSON');
  }
  return JSON.parse(match[0]) as T;
}
