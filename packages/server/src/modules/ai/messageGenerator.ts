import { and, eq, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  agentProfiles,
  agentKnowledgeBase,
  leads,
  contacts,
  campaigns,
  cadenceSteps,
  messages,
  businessProfiles,
} from '../../db/schema.js';
import { claude } from './anthropic.js';
import { NotFoundError } from '../../utils/errors.js';

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

  const knowledge = await db
    .select()
    .from(agentKnowledgeBase)
    .where(
      and(eq(agentKnowledgeBase.agentId, agent.id), eq(agentKnowledgeBase.isActive, true)),
    );

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

  const conversation = await db
    .select({
      direction: messages.direction,
      bodyText: messages.bodyText,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.contactId, contact.id))
    .orderBy(desc(messages.createdAt))
    .limit(10);

  const systemPrompt = buildSystemPrompt({
    agent,
    businessProfile,
    knowledge,
    campaign,
    step,
  });

  const userPrompt = buildUserPrompt({
    agent,
    contact,
    lead,
    campaign,
    step,
    conversation,
    instructions: input.instructions,
  });

  const { text, inputTokens, outputTokens, model } = await claude(userPrompt, {
    organizationId: input.organizationId,
    system: systemPrompt,
    maxTokens: 1024,
    temperature: 0.7,
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

  const systemPrompt = buildSystemPrompt({ agent });
  const { text } = await claude(prompt, {
    organizationId: input.organizationId,
    system: systemPrompt,
    maxTokens: 800,
  });
  return parseSubjectAndBody(text);
}

// ---------- Helpers ----------

function buildSystemPrompt(args: {
  agent: typeof agentProfiles.$inferSelect;
  businessProfile?: typeof businessProfiles.$inferSelect;
  knowledge?: Array<typeof agentKnowledgeBase.$inferSelect>;
  campaign?: typeof campaigns.$inferSelect;
  step?: typeof cadenceSteps.$inferSelect;
}): string {
  const { agent, businessProfile, knowledge, campaign, step } = args;
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
      `Knowledge base:\n${knowledge.map((k) => `- [${k.knowledgeType}] ${k.title}: ${k.content}`).join('\n')}`,
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
}): string {
  const { contact, lead, step, conversation, instructions } = args;

  const lines: string[] = [];
  lines.push(`Prospect: ${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim());
  if (contact.jobTitle) lines.push(`Title: ${contact.jobTitle}`);
  lines.push(`Company: ${lead.companyName} (${lead.companyIndustry ?? 'unknown industry'})`);
  if (lead.companySize) lines.push(`Size: ${lead.companySize}`);
  if (lead.companyLocation) lines.push(`Location: ${lead.companyLocation}`);
  if (contact.personalityNotes) lines.push(`Personality notes: ${contact.personalityNotes}`);

  if (conversation.length > 0) {
    lines.push('\nConversation history (most recent first):');
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
