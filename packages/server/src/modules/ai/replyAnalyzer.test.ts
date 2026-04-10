import { describe, expect, it } from 'vitest';
import { analyzeReply } from './replyAnalyzer.js';

// Tests run with a dummy org id. Since no key is configured in the test
// environment, the Claude call throws internally and the heuristic
// fallback path is exercised — exactly what we want to validate here.
const TEST_ORG = '00000000-0000-0000-0000-000000000000';

describe('analyzeReply (fallback heuristics)', () => {
  it('detects unsubscribe requests', async () => {
    const result = await analyzeReply('Please unsubscribe me from this list.', TEST_ORG);
    expect(result.intent).toBe('unsubscribe');
    expect(result.recommendedNextStep).toBe('drop');
  });

  it('detects meeting requests', async () => {
    const result = await analyzeReply(
      'Sure, can we book a meeting next week?',
      TEST_ORG,
    );
    expect(['meeting_request', 'interested']).toContain(result.intent);
  });
});
