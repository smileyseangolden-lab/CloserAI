import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  agentProfiles,
  leads,
  contacts,
  campaigns,
  cadenceSteps,
  businessProfiles,
} from '../../db/schema.js';
import { claude } from './anthropic.js';
import { NotFoundError } from '../../utils/errors.js';
import { retrieveRelevantKnowledge, RetrievedKnowledge } from './knowledgeRetrieval.js';
import { getThreadSnapshot, ThreadSnapshot } from './threadMemory.js';

interface MessageDraftInput {
  agentId: string;
  contactId: string;
  organizationId: string;
  campaignId?: string;
  stepId?: string;
  instructions?: string;
}

interface MessageDraft {
  subject: string;
  bodyText: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Builds the full multi-context system prompt for an agent and asks
 * Claude to draft a personalized message for a specific contact.
 */
export async function generateMessageDraft(input: MessageDraftInput): Promise<MessageDraft> {
  const [agent] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.id, input.agentId),
        eq(agentProfiles.organizationId, input.organizationId),
        isNull(agentProfiles.deletedAt),
      ),
    )
    .limit(1);
  if (!agent) throw new NotFoundError('Agent');

  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.id, input.contactId), eq(contacts.organizationId, input.organizationId)),
    )
    .limit(1);
  if (!contact) throw new NotFoundError('Contact');

  const [lead] = await db.select().from(leads).where(eq(leads.id, contact.leadId)).limit(1);
  if (!lead) throw new NotFoundError('Lead');

  const [businessProfile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, input.organizationId))
    .limit(1);

  let campaign: typeof campaigns.$inferSelect | undefined;
  let step: typeof cadenceSteps.$inferSelect | undefined;
  if (input.campaignId) {
    [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .limit(1);
  }
  if (input.stepId) {
    [step] = await db
      .select()
      .from(cadenceSteps)
      .where(eq(cadenceSteps.id, input.stepId))
      .limit(1);
  }

  const threadSnapshot = await getThreadSnapshot(contact.id, input.organizationId);
  const conversation = threadSnapshot.recent.map((m) => ({
    direction: m.direction,
    bodyText: m.bodyText,
    createdAt: m.createdAt,
  }));

  const retrievalQuery = buildRetrievalQuery({
    contact,
    lead,
    campaign,
    step,
    conversation,
    instructions: input.instructions,
  });

  const knowledge = await retrieveRelevantKnowledge({
    agentId: agent.id,
    query: retrievalQuery,
    organizationId: input.organizationId,
  });

  const systemPrompt = buildSystemPrompt({
    agent,
    businessProfile,
    knowledge,
    campaign,
    step,
    threadSnapshot,
  });

  const userPrompt = buildUserPrompt({
    agent,
    contact,
    lead,
    campaign,
    step,
    conversation,
    instructions: input.instructions,
    threadSnapshot,
  });

  const { text, inputTokens, outputTokens, model } = await claude(userPrompt, {
    system: systemPrompt,
    maxTokens: 1024,
    temperature: 0.7,
    orgId: input.organizationId,
  });

  const { subject, bodyText } = parseSubjectAndBody(text);

  return { subject, bodyText, model, inputTokens, outputTokens };
}

export async function generateTestMessage(input: {
  agentId: string;
  organizationId: string;
  leadId?: string;
  scenario: string;
}): Promise<{ subject: string; bodyText: string }> {
  const [agent] = await db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.id, input.agentId),
        eq(agentProfiles.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!agent) throw new NotFoundError('Agent');

  const prompt = `Scenario: ${input.scenario}

Write a sample outbound email in your voice for this scenario. Include a subject line.`;

  const knowledge = await retrieveRelevantKnowledge({
    agentId: agent.id,
    query: input.scenario,
    organizationId: input.organizationId,
  });

  const systemPrompt = buildSystemPrompt({ agent, knowledge });
  const { text } = await claude(prompt, {
    system: systemPrompt,
    maxTokens: 800,
    orgId: input.organizationId,
  });
  return parseSubjectAndBody(text);
}

function buildRetrievalQuery(args: {
  contact: typeof contacts.$inferSelect;
  lead: typeof leads.$inferSelect;
  campaign?: typeof campaigns.$inferSelect;
  step?: typeof cadenceSteps.$inferSelect;
  conversation: Array<{ direction: string; bodyText: string; createdAt: Date | null }>;
  instructions?: string;
}): string {
  const { contact, lead, campaign, step, conversation, instructions } = args;
  const parts: string[] = [];
  if (contact.jobTitle) parts.push(contact.jobTitle);
  parts.push(`${lead.companyName} ${lead.companyIndustry ?? ''}`);
  if (campaign?.strategy) parts.push(`strategy:${campaign.strategy}`);
  if (campaign?.description) parts.push(campaign.description);
  if (step?.personalizationInstructions) parts.push(step.personalizationInstructions);
  if (step?.subjectTemplate) parts.push(step.subjectTemplate);
  if (instructions) parts.push(instructions);
  // Most recent inbound reply, if any — strongest signal for objection-handling lookup.
  const lastInbound = conversation.find((m) => m.direction === 'inbound');
  if (lastInbound) parts.push(lastInbound.bodyText.slice(0, 500));
  return parts.filter(Boolean).join(' | ');
}

// ---------- Helpers ----------

function buildSystemPrompt(args: {
  agent: typeof agentProfiles.$inferSelect;
  businessProfile?: typeof businessProfiles.$inferSelect;
  knowledge?: RetrievedKnowledge[];
  campaign?: typeof campaigns.$inferSelect;
  step?: typeof cadenceSteps.$inferSelect;
  threadSnapshot?: ThreadSnapshot;
}): string {
  const { agent, businessProfile, knowledge, campaign, step, threadSnapshot } = args;
  const parts: string[] = [];

  parts.push(
    `You are ${agent.senderName}${agent.senderTitle ? `, ${agent.senderTitle}` : ''}. ` +
      `You are a ${agent.agentType} for your company.`,
  );
  parts.push(`Your personality style: ${agent.personalityStyle}.`);
  if (agent.toneDescription) parts.push(`Your tone: ${agent.toneDescription}`);
  if (agent.writingStyleExamples?.length) {
    parts.push(
      `Examples of how you write:\n${agent.writingStyleExamples.map((e) => `"""${e}"""`).join('\n')}`,
    );
  }
  if (agent.emailSignature) parts.push(`Your email signature:\n${agent.emailSignature}`);

  if (businessProfile) {
    parts.push(
      `Company context: ${businessProfile.companyName} — ${businessProfile.valueProposition ?? ''}`,
    );
    if (businessProfile.keyDifferentiators?.length) {
      parts.push(`Differentiators: ${businessProfile.keyDifferentiators.join('; ')}`);
    }
  }

  if (knowledge?.length) {
    parts.push(
      `Relevant knowledge (top ${knowledge.length}, ranked by semantic similarity):\n${knowledge
        .map(
          (k) =>
            `- [${k.knowledgeType}${k.similarity ? ` sim=${k.similarity.toFixed(2)}` : ''}] ${k.title}: ${k.content}`,
        )
        .join('\n')}`,
    );
  }

  if (threadSnapshot?.summary) {
    parts.push(
      `Conversation so far (${threadSnapshot.totalMessages} total messages, older ones summarized):\n${threadSnapshot.summary}`,
    );
  }

  if (campaign) {
    parts.push(`Campaign strategy: ${campaign.strategy}. ${campaign.description ?? ''}`);
  }

  if (step?.personalizationInstructions) {
    parts.push(`Step-specific instructions: ${step.personalizationInstructions}`);
  }

  if (agent.systemPromptOverride) {
    parts.push(agent.systemPromptOverride);
  }

  parts.push(
    'Rules: Do not use em dashes. Keep messages concise and natural. Do NOT invent facts about the prospect. Output the subject as the first line prefixed with "Subject: " and then a blank line followed by the email body.',
  );

  return parts.join('\n\n');
}

function buildUserPrompt(args: {
  agent: typeof agentProfiles.$inferSelect;
  contact: typeof contacts.$inferSelect;
  lead: typeof leads.$inferSelect;
  campaign?: typeof campaigns.$inferSelect;
  step?: typeof cadenceSteps.$inferSelect;
  conversation: Array<{ direction: string; bodyText: string; createdAt: Date | null }>;
  instructions?: string;
  threadSnapshot?: ThreadSnapshot;
}): string {
  const { contact, lead, step, conversation, instructions, threadSnapshot } = args;

  const lines: string[] = [];
  lines.push(`Prospect: ${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim());
  if (contact.jobTitle) lines.push(`Title: ${contact.jobTitle}`);
  lines.push(`Company: ${lead.companyName} (${lead.companyIndustry ?? 'unknown industry'})`);
  if (lead.companySize) lines.push(`Size: ${lead.companySize}`);
  if (lead.companyLocation) lines.push(`Location: ${lead.companyLocation}`);
  if (contact.personalityNotes) lines.push(`Personality notes: ${contact.personalityNotes}`);

  if (conversation.length > 0) {
    const total = threadSnapshot?.totalMessages ?? conversation.length;
    const label =
      total > conversation.length
        ? `Recent messages (last ${conversation.length} of ${total}; older context is in the summary above)`
        : 'Conversation history';
    lines.push(`\n${label}:`);
    for (const m of conversation) {
      lines.push(`[${m.direction}] ${m.bodyText.slice(0, 400)}`);
    }
  }

  if (step?.bodyTemplate) {
    lines.push(`\nBase template to personalize:\n${step.bodyTemplate}`);
  }
  if (step?.subjectTemplate) {
    lines.push(`Subject template: ${step.subjectTemplate}`);
  }

  if (instructions) lines.push(`\nExtra instructions: ${instructions}`);

  lines.push(
    '\nWrite the next outbound message. Remember the subject line format and tone rules.',
  );

  return lines.join('\n');
}

function parseSubjectAndBody(text: string): { subject: string; bodyText: string } {
  const match = text.match(/^Subject:\s*(.+?)\n+([\s\S]*)$/i);
  if (match && match[1] && match[2]) {
    return { subject: match[1].trim(), bodyText: match[2].trim() };
  }
  return { subject: '', bodyText: text.trim() };
}
