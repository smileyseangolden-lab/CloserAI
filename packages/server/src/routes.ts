import { Router } from 'express';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { organizationsRouter } from './modules/organizations/organizations.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { profilesRouter } from './modules/profiles/profiles.routes.js';
import { icpsRouter } from './modules/icps/icps.routes.js';
import { leadsRouter } from './modules/leads/leads.routes.js';
import { contactsRouter } from './modules/contacts/contacts.routes.js';
import { agentsRouter } from './modules/agents/agents.routes.js';
import { campaignsRouter } from './modules/campaigns/campaigns.routes.js';
import { messagesRouter } from './modules/messages/messages.routes.js';
import { opportunitiesRouter } from './modules/opportunities/opportunities.routes.js';
import { activitiesRouter } from './modules/activities/activities.routes.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';

export function createApiRouter() {
  const api = Router();

  api.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

  // Public
  api.use('/auth', authRouter);

  // Authenticated
  api.use('/organizations', requireAuth, organizationsRouter);
  api.use('/users', requireAuth, usersRouter);
  api.use('/profiles', requireAuth, profilesRouter);
  api.use('/icps', requireAuth, icpsRouter);
  api.use('/leads', requireAuth, leadsRouter);
  api.use('/contacts', requireAuth, contactsRouter);
  api.use('/agents', requireAuth, agentsRouter);
  api.use('/campaigns', requireAuth, campaignsRouter);
  api.use('/messages', requireAuth, messagesRouter);
  api.use('/opportunities', requireAuth, opportunitiesRouter);
  api.use('/activities', requireAuth, activitiesRouter);
  api.use('/analytics', requireAuth, analyticsRouter);

  return api;
}
