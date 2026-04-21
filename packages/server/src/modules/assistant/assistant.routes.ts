import { Router } from 'express';
import { and, eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { assistantMessages, workspaceStages } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { ValidationError } from '../../utils/errors.js';
import { claude } from '../ai/anthropic.js';
import { logger } from '../../utils/logger.js';
import {
  getStageDefinition,
  isValidStageId,
  STAGE_DEFINITIONS,
} from '../workspace/workspace.stages.js';

export const assistantRouter = Router();

assistantRouter.get('/:stageId/history', async (req, res, next) => {
  try {
    const { stageId } = req.params;
    if (!stageId || !isValidStageId(stageId)) {
      throw new ValidationError('Invalid stage id');
    }
    const rows = await db
      .select()
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.organizationId, req.auth!.organizationId),
          eq(assistantMessages.stageId, stageId),
        ),
      )
      .orderBy(asc(assistantMessages.createdAt));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

assistantRouter.delete('/:stageId/history', async (req, res, next) => {
  try {
    const { stageId } = req.params;
    if (!stageId || !isValidStageId(stageId)) {
      throw new ValidationError('Invalid stage id');
    }
    await db
      .delete(assistantMessages)
      .where(
        and(
          eq(assistantMessages.organizationId, req.auth!.organizationId),
          eq(assistantMessages.stageId, stageId),
        ),
      );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const chatSchema = z.object({
  message: z.string().min(1),
});

assistantRouter.post('/:stageId/chat', validateBody(chatSchema), async (req, res, next) => {
  try {
    const { stageId } = req.params;
    if (!stageId || !isValidStageId(stageId)) {
      throw new ValidationError('Invalid stage id');
    }
    const stage = getStageDefinition(stageId)!;
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;

    const prior = await db
      .select()
      .from(assistantMessages)
      .where(
        and(
          eq(assistantMessages.organizationId, orgId),
          eq(assistantMessages.stageId, stageId),
        ),
      )
      .orderBy(asc(assistantMessages.createdAt));

    const approvedStages = await db
      .select()
      .from(workspaceStages)
      .where(
        and(
          eq(workspaceStages.organizationId, orgId),
          eq(workspaceStages.status, 'approved'),
        ),
      );

    const priorContextBlock = approvedStages.length
      ? 'Previously approved workspace data from earlier stages:\n' +
        approvedStages
          .map((s) => `- ${s.stageId}: ${JSON.stringify(s.data).slice(0, 2000)}`)
          .join('\n')
      : 'No prior approved stages yet.';

    const systemPrompt = `${stage.systemPrompt}

${priorContextBlock}

When you have new structured information, end your reply with a fenced \`\`\`json code block containing a single object named "proposedDraft" — e.g.:
\`\`\`json
{ "field": "value" }
\`\`\`
Only include keys you are confident about. Omit the block entirely when the turn is purely conversational.`;

    const transcript = prior
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const prompt = transcript
      ? `${transcript}\n\nUser: ${req.body.message}`
      : `User: ${req.body.message}`;

    const { text } = await claude(prompt, {
      system: systemPrompt,
      orgId,
      maxTokens: 2048,
      temperature: 0.5,
    });

    const proposedDraft = extractProposedDraft(text);
    const visibleText = stripJsonBlock(text);

    const [userRow] = await db
      .insert(assistantMessages)
      .values({
        organizationId: orgId,
        userId,
        stageId,
        role: 'user',
        content: req.body.message,
      })
      .returning();

    const [assistantRow] = await db
      .insert(assistantMessages)
      .values({
        organizationId: orgId,
        userId,
        stageId,
        role: 'assistant',
        content: visibleText,
        proposedDraft,
      })
      .returning();

    res.json({
      userMessage: userRow,
      assistantMessage: assistantRow,
      proposedDraft,
    });
  } catch (err) {
    logger.error({ err }, 'assistant chat failed');
    next(err);
  }
});

assistantRouter.get('/stages', async (_req, res) => {
  res.json(
    STAGE_DEFINITIONS.map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      description: s.description,
      openingPrompt: s.openingPrompt,
    })),
  );
});

function extractProposedDraft(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  if (!match || !match[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if ('proposedDraft' in parsed && typeof parsed.proposedDraft === 'object') {
        return parsed.proposedDraft as Record<string, unknown>;
      }
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function stripJsonBlock(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/gi, '').trim();
}
