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
import { inboundRouter } from './modules/inbound/inbound.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { workspaceRouter } from './modules/workspace/workspace.routes.js';
import { assistantRouter } from './modules/assistant/assistant.routes.js';
import { dataSourcesRouter } from './modules/dataSources/dataSources.routes.js';
import { valuePropsRouter } from './modules/valueProps/valueProps.routes.js';
import { knowledgeRouter } from './modules/knowledge/knowledge.routes.js';
import { deploymentsRouter } from './modules/deployments/deployments.routes.js';
import { pilotRouter } from './modules/pilot/pilot.routes.js';
import { handoffRouter } from './modules/handoff/handoff.routes.js';
import { queriesRouter } from './modules/queries/queries.routes.js';
import { optimizationRouter } from './modules/optimization/optimization.routes.js';

export function createApiRouter() {
  const api = Router();

  api.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

  // Public
  api.use('/auth', authRouter);
  api.use('/inbound', inboundRouter);

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
  api.use('/admin', requireAuth, adminRouter);
  api.use('/workspace', requireAuth, workspaceRouter);
  api.use('/assistant', requireAuth, assistantRouter);
  api.use('/data-sources', requireAuth, dataSourcesRouter);
  api.use('/value-props', requireAuth, valuePropsRouter);
  api.use('/knowledge', requireAuth, knowledgeRouter);
  api.use('/deployments', requireAuth, deploymentsRouter);
  api.use('/pilot', requireAuth, pilotRouter);
  api.use('/handoff', requireAuth, handoffRouter);
  api.use('/queries', requireAuth, queriesRouter);
  api.use('/optimization', requireAuth, optimizationRouter);

  return api;
}
