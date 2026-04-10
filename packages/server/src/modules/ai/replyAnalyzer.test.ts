import { describe, expect, it } from 'vitest';
import { analyzeReply } from './replyAnalyzer.js';

describe('analyzeReply (fallback heuristics)', () => {
  it('detects unsubscribe requests', async () => {
    const result = await analyzeReply('Please unsubscribe me from this list.');
    expect(result.intent).toBe('unsubscribe');
    expect(result.recommendedNextStep).toBe('drop');
  });

  it('detects meeting requests', async () => {
    const result = await analyzeReply('Sure, can we book a meeting next week?');
    expect(['meeting_request', 'interested']).toContain(result.intent);
  });
});
