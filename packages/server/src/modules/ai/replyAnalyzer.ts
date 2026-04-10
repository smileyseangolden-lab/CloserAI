import { claudeJson } from './anthropic.js';

export type ReplyIntent =
  | 'interested'
  | 'not_interested'
  | 'more_info'
  | 'objection'
  | 'meeting_request'
  | 'referral'
  | 'out_of_office'
  | 'unsubscribe'
  | 'unclear';

export interface ReplyAnalysis {
  intent: ReplyIntent;
  sentiment: number; // -1..1
  summary: string;
  actionItems: string[];
  recommendedNextStep: 'auto_reply' | 'escalate_to_closer' | 'handoff_to_human' | 'drop';
}

/**
 * Classifies an inbound reply and recommends the next move.
 * If the org has no Anthropic key configured, falls back to deterministic
 * keyword heuristics so the worker doesn't stall.
 */
export async function analyzeReply(
  replyText: string,
  organizationId: string,
): Promise<ReplyAnalysis> {
  const prompt = `Analyze the following inbound sales reply and classify it.

Reply:
"""
${replyText}
"""

Return JSON with:
- intent: one of "interested", "not_interested", "more_info", "objection", "meeting_request", "referral", "out_of_office", "unsubscribe", "unclear"
- sentiment: number between -1 (very negative) and 1 (very positive)
- summary: one sentence summary
- actionItems: array of concrete next actions
- recommendedNextStep: one of "auto_reply", "escalate_to_closer", "handoff_to_human", "drop"`;

  try {
    return await claudeJson<ReplyAnalysis>(prompt, {
      organizationId,
      maxTokens: 512,
      temperature: 0.2,
      fast: true,
    });
  } catch {
    // Fallback heuristic if Claude unavailable / fails to return JSON
    const lower = replyText.toLowerCase();
    if (lower.includes('unsubscribe') || lower.includes('remove me')) {
      return {
        intent: 'unsubscribe',
        sentiment: -0.5,
        summary: 'Prospect requested unsubscribe',
        actionItems: ['Mark contact as do_not_contact'],
        recommendedNextStep: 'drop',
      };
    }
    if (lower.includes('meeting') || lower.includes('calendar') || lower.includes('book')) {
      return {
        intent: 'meeting_request',
        sentiment: 0.6,
        summary: 'Prospect is asking to schedule a meeting',
        actionItems: ['Send calendar link'],
        recommendedNextStep: 'escalate_to_closer',
      };
    }
    return {
      intent: 'unclear',
      sentiment: 0,
      summary: 'Unable to classify automatically',
      actionItems: [],
      recommendedNextStep: 'handoff_to_human',
    };
  }
}
