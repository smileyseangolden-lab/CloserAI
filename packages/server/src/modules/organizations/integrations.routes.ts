import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/auth.js';
import {
  getAnthropicKeyStatus,
  setAnthropicKeyForOrg,
  clearAnthropicKeyForOrg,
  testAnthropicKey,
} from '../ai/anthropicKeyService.js';

export const integrationsRouter = Router();

/**
 * All integration credential routes are owner-only. Admins and below can
 * use the integrations, but only an owner can rotate the keys.
 */

// ---- Anthropic ----

integrationsRouter.get('/anthropic', async (req, res, next) => {
  try {
    const status = await getAnthropicKeyStatus(req.auth!.organizationId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

const putKeySchema = z.object({
  apiKey: z.string().min(20).max(500),
});

integrationsRouter.put(
  '/anthropic',
  requireRole('owner'),
  validateBody(putKeySchema),
  async (req, res, next) => {
    try {
      const result = await setAnthropicKeyForOrg(
        req.auth!.organizationId,
        req.body.apiKey,
      );
      res.json({
        isConfigured: true,
        keyPrefix: result.prefix,
        updatedAt: result.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

integrationsRouter.delete(
  '/anthropic',
  requireRole('owner'),
  async (req, res, next) => {
    try {
      await clearAnthropicKeyForOrg(req.auth!.organizationId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Validate a candidate key by making a 1-token ping to Claude. Used by
 * the "Test connection" button in the UI before the user saves, so we
 * never write a broken key to the database.
 */
integrationsRouter.post(
  '/anthropic/test',
  requireRole('owner'),
  validateBody(putKeySchema),
  async (req, res, next) => {
    try {
      const result = await testAnthropicKey(req.body.apiKey);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
