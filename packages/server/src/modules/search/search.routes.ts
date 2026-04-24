import { Router } from 'express';
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  agentProfiles,
  campaigns,
  contacts,
  leads,
} from '../../db/schema.js';
import { validateQuery } from '../../middleware/validate.js';

export const searchRouter = Router();

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

/**
 * Unified search across leads, campaigns, agents, and contacts for the
 * command palette. Case-insensitive substring match (ILIKE). Results are
 * capped per type so the palette can render grouped lists without pulling a
 * lot of data.
 */
searchRouter.get('/', validateQuery(querySchema), async (req, res, next) => {
  try {
    const q = (req as typeof req & { validatedQuery: z.infer<typeof querySchema> })
      .validatedQuery;
    const orgId = req.auth!.organizationId;
    const pattern = `%${q.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

    const [leadRows, campaignRows, agentRows, contactRows] = await Promise.all([
      db
        .select({
          id: leads.id,
          title: leads.companyName,
          subtitle: sql<string | null>`${leads.companyIndustry}`,
        })
        .from(leads)
        .where(
          and(
            eq(leads.organizationId, orgId),
            isNull(leads.deletedAt),
            or(
              ilike(leads.companyName, pattern),
              ilike(leads.companyWebsite, pattern),
              ilike(leads.companyLocation, pattern),
            ),
          ),
        )
        .limit(q.limit),

      db
        .select({
          id: campaigns.id,
          title: campaigns.name,
          subtitle: sql<string | null>`${campaigns.campaignType}::text`,
        })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.organizationId, orgId),
            isNull(campaigns.deletedAt),
            or(ilike(campaigns.name, pattern), ilike(campaigns.description, pattern)),
          ),
        )
        .limit(q.limit),

      db
        .select({
          id: agentProfiles.id,
          title: agentProfiles.name,
          subtitle: agentProfiles.senderName,
        })
        .from(agentProfiles)
        .where(
          and(
            eq(agentProfiles.organizationId, orgId),
            isNull(agentProfiles.deletedAt),
            or(
              ilike(agentProfiles.name, pattern),
              ilike(agentProfiles.senderName, pattern),
            ),
          ),
        )
        .limit(q.limit),

      db
        .select({
          id: contacts.id,
          leadId: contacts.leadId,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          jobTitle: contacts.jobTitle,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, orgId),
            isNull(contacts.deletedAt),
            or(
              ilike(contacts.firstName, pattern),
              ilike(contacts.lastName, pattern),
              ilike(contacts.email, pattern),
            ),
          ),
        )
        .limit(q.limit),
    ]);

    res.json({
      leads: leadRows,
      campaigns: campaignRows,
      agents: agentRows,
      contacts: contactRows.map((c) => ({
        id: c.id,
        leadId: c.leadId,
        title: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || 'Contact',
        subtitle: c.email ?? c.jobTitle ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});
