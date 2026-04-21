/**
 * Tool-calling conversation engine for the stage assistants.
 *
 * Responsibilities:
 *  - Routes to the right Claude model for the stage (Opus for S4/S5/S11,
 *    default for everything else).
 *  - Executes tool_use turns locally, feeds the tool_result back in, loops
 *    until the model emits stop_reason=end_turn (or we hit a safety cap).
 *  - Extracts a trailing JSON "proposedDraft" block from the assistant's
 *    final text so the client can auto-populate the live preview.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../admin/settingsService.js';
import { runTool, toolsForStage, type ToolContext } from './assistantTools.js';

const OPUS_STAGES = new Set(['icp', 'value-prop', 'optimization']);
const MAX_TOOL_TURNS = 5;

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface EngineRequest {
  stageId: string;
  systemPrompt: string;
  history: AssistantTurn[];
  userMessage: string;
  orgId: string;
}

export interface EngineResponse {
  text: string;
  proposedDraft: Record<string, unknown> | null;
  toolTrace: Array<{ name: string; input: unknown; result: string }>;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Streaming event payloads emitted by runAssistantTurnStream. */
export type StreamEvent =
  | { type: 'meta'; model: string }
  | { type: 'delta'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: string }
  | {
      type: 'done';
      text: string;
      proposedDraft: Record<string, unknown> | null;
      toolTrace: EngineResponse['toolTrace'];
      inputTokens: number;
      outputTokens: number;
      model: string;
    }
  | { type: 'error'; message: string };

interface ResolvedModels {
  apiKey: string;
  defaultModel: string;
  opusModel: string;
}

async function resolveModels(orgId: string): Promise<ResolvedModels> {
  const c = await resolveProviderConfig(orgId, 'anthropic');
  const apiKey = (c.values.apiKey as string) || env.ANTHROPIC_API_KEY;
  const defaultModel = (c.values.model as string) || env.ANTHROPIC_MODEL;
  // We route to whatever is registered as the default; if that is already an
  // Opus variant we use it. If the org has configured a stronger "opusModel"
  // key we prefer that. Otherwise fall back to the default.
  const opusModel = (c.values.opusModel as string) || defaultModel;
  return { apiKey, defaultModel, opusModel };
}

function modelForStage(stageId: string, models: ResolvedModels): string {
  return OPUS_STAGES.has(stageId) ? models.opusModel : models.defaultModel;
}

export async function runAssistantTurn(req: EngineRequest): Promise<EngineResponse> {
  const models = await resolveModels(req.orgId);
  const model = modelForStage(req.stageId, models);

  if (!models.apiKey) {
    // Graceful stub when no key is configured — mirrors anthropic.ts behaviour.
    return {
      text:
        "(No Anthropic API key configured — I can't run research tools. Add a key in Admin → Integrations, then re-ask.)",
      proposedDraft: null,
      toolTrace: [],
      model,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const client = new Anthropic({ apiKey: models.apiKey });
  const tools = toolsForStage(req.stageId);
  const toolCtx: ToolContext = { organizationId: req.orgId, stageId: req.stageId };

  const messages: Anthropic.MessageParam[] = [
    ...req.history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: req.userMessage },
  ];

  const toolTrace: EngineResponse['toolTrace'] = [];
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await client.messages.create({
      model,
      max_tokens: 2048,
      temperature: 0.5,
      system: req.systemPrompt,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool['input_schema'],
      })),
      messages,
    });
    totalIn += res.usage.input_tokens ?? 0;
    totalOut += res.usage.output_tokens ?? 0;

    // If the model wants a tool, run each tool_use block and append tool_result.
    if (res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      // Echo the assistant's tool-call turn back into the transcript.
      messages.push({ role: 'assistant', content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await runTool(
          tu.name,
          tu.input as Record<string, unknown>,
          toolCtx,
        );
        toolTrace.push({ name: tu.name, input: tu.input, result: result.slice(0, 2000) });
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    finalText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    break;
  }

  const { visible, draft } = extractDraft(finalText);
  return {
    text: visible,
    proposedDraft: draft,
    toolTrace,
    model,
    inputTokens: totalIn,
    outputTokens: totalOut,
  };
}

/**
 * Streaming variant of runAssistantTurn. Calls `emit` for each SSE-shaped
 * event: meta, delta (token chunks), tool_use, tool_result, done, error.
 * The tool-calling loop still runs to completion between streamed text turns.
 */
export async function runAssistantTurnStream(
  req: EngineRequest,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const models = await resolveModels(req.orgId);
  const model = modelForStage(req.stageId, models);
  emit({ type: 'meta', model });

  if (!models.apiKey) {
    const text =
      "(No Anthropic API key configured — I can't run research tools. Add a key in Admin → Integrations, then re-ask.)";
    emit({ type: 'delta', text });
    emit({
      type: 'done',
      text,
      proposedDraft: null,
      toolTrace: [],
      inputTokens: 0,
      outputTokens: 0,
      model,
    });
    return;
  }

  const client = new Anthropic({ apiKey: models.apiKey });
  const tools = toolsForStage(req.stageId);
  const toolCtx: ToolContext = { organizationId: req.orgId, stageId: req.stageId };

  const messages: Anthropic.MessageParam[] = [
    ...req.history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: req.userMessage },
  ];
  const toolTrace: EngineResponse['toolTrace'] = [];
  let totalIn = 0;
  let totalOut = 0;
  let accumulatedText = '';

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const stream = client.messages.stream({
      model,
      max_tokens: 2048,
      temperature: 0.5,
      system: req.systemPrompt,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool['input_schema'],
      })),
      messages,
    });

    // Forward text deltas to the SSE listener as they arrive.
    stream.on('text', (delta) => {
      accumulatedText += delta;
      emit({ type: 'delta', text: delta });
    });

    const finalMsg = await stream.finalMessage();
    totalIn += finalMsg.usage?.input_tokens ?? 0;
    totalOut += finalMsg.usage?.output_tokens ?? 0;

    if (finalMsg.stop_reason === 'tool_use') {
      const toolUses = finalMsg.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      messages.push({ role: 'assistant', content: finalMsg.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        emit({ type: 'tool_use', name: tu.name, input: tu.input });
        const result = await runTool(tu.name, tu.input as Record<string, unknown>, toolCtx);
        emit({ type: 'tool_result', name: tu.name, result: result.slice(0, 1000) });
        toolTrace.push({ name: tu.name, input: tu.input, result: result.slice(0, 2000) });
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  const { visible, draft } = extractDraft(accumulatedText);
  emit({
    type: 'done',
    text: visible,
    proposedDraft: draft,
    toolTrace,
    inputTokens: totalIn,
    outputTokens: totalOut,
    model,
  });
}

function extractDraft(text: string): {
  visible: string;
  draft: Record<string, unknown> | null;
} {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (!match || !match[1]) {
    return { visible: text.trim(), draft: null };
  }
  let draft: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      draft =
        'proposedDraft' in parsed && parsed.proposedDraft && typeof parsed.proposedDraft === 'object'
          ? (parsed.proposedDraft as Record<string, unknown>)
          : (parsed as Record<string, unknown>);
    }
  } catch (err) {
    logger.warn({ err }, 'failed to parse assistant proposedDraft JSON');
  }
  return {
    visible: text.replace(/```json\s*[\s\S]*?```/gi, '').trim(),
    draft,
  };
}
