import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { NotFoundError } from '../../utils/errors.js';
import { PROVIDER_CATALOG, getProviderDefinition } from './catalog.js';
import {
  deleteProviderSettings,
  listProviderSettingsForOrg,
  resolveProviderConfig,
  upsertProviderSettings,
} from './settingsService.js';
import { runProviderTest } from './providerTesters.js';

export const adminRouter = Router();

// All admin endpoints are owner/admin-only.
adminRouter.use(requireRole('owner', 'admin'));

adminRouter.get('/providers/catalog', (_req, res) => {
  res.json(PROVIDER_CATALOG);
});

adminRouter.get('/providers', async (req, res, next) => {
  try {
    const settings = await listProviderSettingsForOrg(req.auth!.organizationId);
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

const upsertSchema = z
  .object({
    payload: z.record(z.unknown()),
    isActive: z.boolean().optional(),
  })
  .strict();

adminRouter.put(
  '/providers/:providerKey',
  validateBody(upsertSchema),
  async (req, res, next) => {
    try {
      const def = getProviderDefinition(req.params.providerKey!);
      if (!def) throw new NotFoundError('Provider');
      await upsertProviderSettings({
        orgId: req.auth!.organizationId,
        providerKey: req.params.providerKey!,
        payload: req.body.payload,
        userId: req.auth!.userId,
        isActive: req.body.isActive,
      });
      const settings = await listProviderSettingsForOrg(req.auth!.organizationId);
      const updated = settings.find((s) => s.providerKey === req.params.providerKey);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete('/providers/:providerKey', async (req, res, next) => {
  try {
    const def = getProviderDefinition(req.params.providerKey!);
    if (!def) throw new NotFoundError('Provider');
    await deleteProviderSettings(req.auth!.organizationId, req.params.providerKey!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/providers/:providerKey/test', async (req, res, next) => {
  try {
    const def = getProviderDefinition(req.params.providerKey!);
    if (!def) throw new NotFoundError('Provider');
    if (!def.testable) {
      return res.status(400).json({
        error: { code: 'NOT_TESTABLE', message: 'No test available for this provider' },
      });
    }
    // Use the resolved (decrypted) config so the test works against whatever
    // the org currently has saved, not whatever happens to be in the request.
    const resolved = await resolveProviderConfig(
      req.auth!.organizationId,
      req.params.providerKey!,
    );
    const result = await runProviderTest(req.params.providerKey!, resolved.values);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    next(err);
  }
});
