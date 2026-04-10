import { and, eq, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { opportunities, messages, contacts } from '../../db/schema.js';
import { claudeJson } from './anthropic.js';
import { NotFoundError } from '../../utils/errors.js';

export interface DealHealthAnalysis {
  healthScore: number; // 0-100
  riskFactors: string[];
  strengths: string[];
  nextBestActions: string[];
  updatedProbability: number; // 0-100
  reasoning: string;
}

export async function analyzeDealHealth(
  opportunityId: string,
  organizationId: string,
): Promise<DealHealthAnalysis> {
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, opportunityId),
        eq(opportunities.organizationId, organizationId),
        isNull(opportunities.deletedAt),
      ),
    )
    .limit(1);
  if (!opp) throw new NotFoundError('Opportunity');

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, opp.contactId))
    .limit(1);

  const recentMessages = await db
    .select({
      direction: messages.direction,
      bodyText: messages.bodyText,
      sentimentScore: messages.sentimentScore,
      intentClassification: messages.intentClassification,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.contactId, opp.contactId))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  const prompt = `Analyze the health of this sales opportunity.

Opportunity:
- Title: ${opp.title}
- Stage: ${opp.stage}
- Estimated value: ${opp.estimatedValue ?? 'unknown'}
- Current probability: ${opp.probability}
- Expected close: ${opp.expectedCloseDate ?? 'not set'}
- Days in current stage: ${Math.floor((Date.now() - new Date(opp.stageChangedAt).getTime()) / 86400000)}

Primary contact: ${contact?.firstName ?? ''} ${contact?.lastName ?? ''} (${contact?.jobTitle ?? 'unknown role'})

Recent conversation (${recentMessages.length} messages):
${recentMessages.map((m) => `[${m.direction}${m.intentClassification ? ` / ${m.intentClassification}` : ''}] ${m.bodyText.slice(0, 200)}`).join('\n')}

Return JSON with:
- healthScore (0-100)
- riskFactors (array of strings)
- strengths (array of strings)
- nextBestActions (array of 3 specific actions)
- updatedProbability (0-100)
- reasoning (1-2 sentence explanation)`;

  return claudeJson<DealHealthAnalysis>(prompt, { maxTokens: 1024, temperature: 0.3 });
}
