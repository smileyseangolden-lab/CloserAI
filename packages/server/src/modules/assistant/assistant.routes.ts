import { Router } from 'express';
import { and, eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { assistantMessages, workspaceStages } from '../../db/schema.js';
import { validateBody } from '../../middleware/validate.js';
import { ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  getStageDefinition,
  isValidStageId,
  STAGE_DEFINITIONS,
} from '../workspace/workspace.stages.js';
import { runAssistantTurn, runAssistantTurnStream, type StreamEvent } from './assistantEngine.js';

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

You have access to research tools (web_fetch, read_approved_stage, search_knowledge_base, get_company_profile, plus any stage-specific tools). USE THEM proactively when:
  - the user gives you a URL — fetch it before asking questions
  - you need data from an earlier approved stage — read it
  - the user mentions a competitor / brand / page — research it

The user can also issue refine commands at any time: "make it shorter", "more technical", "more proof points", "tighten the differentiators", "drop pricing tier 3". When you see one, revise your most recent proposedDraft and re-emit it whole.

When you have new structured information, end your reply with a fenced \`\`\`json code block containing a single object named "proposedDraft" — e.g.:
\`\`\`json
{ "field": "value" }
\`\`\`
Only include keys you are confident about. Omit the block entirely when the turn is purely conversational.`;

    const result = await runAssistantTurn({
      stageId,
      systemPrompt,
      history: prior.map((m) => ({ role: m.role, content: m.content })),
      userMessage: req.body.message,
      orgId,
    });

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
        content: result.text,
        proposedDraft: result.proposedDraft,
      })
      .returning();

    res.json({
      userMessage: userRow,
      assistantMessage: assistantRow,
      proposedDraft: result.proposedDraft,
      toolTrace: result.toolTrace,
      model: result.model,
    });
  } catch (err) {
    logger.error({ err }, 'assistant chat failed');
    next(err);
  }
});

/**
 * Server-sent-events streaming variant of /chat. Emits the same events the
 * engine produces so the client can render tokens as they arrive instead of
 * waiting for the full turn. Uses query-param auth fallback because the
 * browser EventSource API can't set the Authorization header — callers pass
 * the access token as `?token=`.
 */
assistantRouter.get('/:stageId/chat/stream', async (req, res, next) => {
  try {
    const { stageId } = req.params;
    if (!stageId || !isValidStageId(stageId)) {
      throw new ValidationError('Invalid stage id');
    }
    const message = String(req.query.message ?? '').trim();
    if (!message) throw new ValidationError('Missing message');

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

    const systemPrompt = `${stage.systemPrompt}\n\n${priorContextBlock}\n\nUse research tools proactively. Handle refine commands. End with a \`\`\`json proposedDraft\`\`\` block only when structured changes apply.`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const write = (evt: StreamEvent) => {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    };

    // Persist the user message up-front so the transcript reflects it even if
    // the connection drops mid-stream.
    const [userRow] = await db
      .insert(assistantMessages)
      .values({ organizationId: orgId, userId, stageId, role: 'user', content: message })
      .returning();
    write({ type: 'meta', model: 'pending' });
    res.write(`event: user_saved\ndata: ${JSON.stringify(userRow)}\n\n`);

    let finalText = '';
    let finalDraft: Record<string, unknown> | null = null;
    try {
      await runAssistantTurnStream(
        {
          stageId,
          systemPrompt,
          history: prior.map((m) => ({ role: m.role, content: m.content })),
          userMessage: message,
          orgId,
        },
        (evt) => {
          write(evt);
          if (evt.type === 'done') {
            finalText = evt.text;
            finalDraft = evt.proposedDraft;
          }
        },
      );
    } catch (err) {
      logger.error({ err }, 'assistant stream failed');
      write({
        type: 'error',
        message: err instanceof Error ? err.message : 'stream failed',
      });
    }

    const [assistantRow] = await db
      .insert(assistantMessages)
      .values({
        organizationId: orgId,
        userId,
        stageId,
        role: 'assistant',
        content: finalText,
        proposedDraft: finalDraft,
      })
      .returning();
    res.write(`event: assistant_saved\ndata: ${JSON.stringify(assistantRow)}\n\n`);
    res.end();
  } catch (err) {
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

