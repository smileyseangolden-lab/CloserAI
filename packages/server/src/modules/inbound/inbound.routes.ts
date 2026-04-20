import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  ingestInbound,
  parseGenericPayload,
  parsePostmarkPayload,
  parseSendGridPayload,
  parseMimePayload,
  type InboundProvider,
} from './inboundEmail.js';

export const inboundRouter = Router();

function verifyWebhookAuth(req: Request): boolean {
  // When a secret is configured, require a matching token header or HMAC.
  if (!env.INBOUND_WEBHOOK_SECRET) return true;

  const token = req.header('x-webhook-token');
  if (token && timingSafeEquals(token, env.INBOUND_WEBHOOK_SECRET)) return true;

  const signature = req.header('x-webhook-signature');
  if (signature) {
    const raw =
      (req as Request & { rawBody?: Buffer }).rawBody ??
      Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    const expected = crypto
      .createHmac('sha256', env.INBOUND_WEBHOOK_SECRET)
      .update(raw)
      .digest('hex');
    if (timingSafeEquals(signature, expected)) return true;
  }

  return false;
}

function timingSafeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function pickProvider(req: Request): InboundProvider {
  const hint = (req.params.provider ?? '').toLowerCase();
  if (hint === 'postmark' || hint === 'sendgrid' || hint === 'mailgun' || hint === 'mime') {
    return hint as InboundProvider;
  }
  // Auto-detect from payload shape.
  const body = req.body as Record<string, unknown> | string;
  if (typeof body === 'object' && body) {
    if ('MessageID' in body || 'TextBody' in body) return 'postmark';
    if ('envelope' in body && 'headers' in body) return 'sendgrid';
  }
  return 'generic';
}

async function handleInbound(req: Request, res: Response, next: NextFunction) {
  try {
    if (!verifyWebhookAuth(req)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const provider = pickProvider(req);
    let normalized;
    switch (provider) {
      case 'postmark':
        normalized = parsePostmarkPayload(req.body as Record<string, unknown>);
        break;
      case 'sendgrid':
        normalized = parseSendGridPayload(req.body as Record<string, unknown>);
        break;
      case 'mime':
        normalized = await parseMimePayload(
          typeof req.body === 'string' ? req.body : (req.body as Buffer),
        );
        break;
      case 'generic':
      default:
        normalized = parseGenericPayload(req.body as Record<string, unknown>);
    }

    const result = await ingestInbound(normalized);
    logger.info({ provider, result }, 'Inbound email processed');

    // Always 2xx for successfully received payloads — even "unmatched" — so
    // providers don't retry indefinitely. Surface the outcome in the body.
    const statusCode = result.status === 'error' ? 400 : 200;
    return res.status(statusCode).json(result);
  } catch (err) {
    next(err);
  }
}

inboundRouter.post('/email', handleInbound);
inboundRouter.post('/email/:provider', handleInbound);
