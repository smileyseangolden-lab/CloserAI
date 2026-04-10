import { Router } from 'express';
import { and, eq, isNull, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { leads, campaigns, opportunities, messages, campaignLeads } from '../../db/schema.js';

export const analyticsRouter = Router();

analyticsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;

    const [leadStats] = await db
      .select({
        total: count(),
        newCount: sql<number>`count(*) filter (where ${leads.status} = 'new')`,
        warmCount: sql<number>`count(*) filter (where ${leads.status} = 'warm')`,
        hotCount: sql<number>`count(*) filter (where ${leads.status} = 'hot')`,
        qualifiedCount: sql<number>`count(*) filter (where ${leads.status} = 'qualified')`,
        convertedCount: sql<number>`count(*) filter (where ${leads.status} = 'converted')`,
      })
      .from(leads)
      .where(and(eq(leads.organizationId, orgId), isNull(leads.deletedAt)));

    const [campaignStats] = await db
      .select({
        total: count(),
        activeCount: sql<number>`count(*) filter (where ${campaigns.status} = 'active')`,
      })
      .from(campaigns)
      .where(and(eq(campaigns.organizationId, orgId), isNull(campaigns.deletedAt)));

    const [oppStats] = await db
      .select({
        total: count(),
        openValue: sql<number>`coalesce(sum(${opportunities.estimatedValue}) filter (where ${opportunities.stage} not in ('closed_won','closed_lost')), 0)`,
        wonValue: sql<number>`coalesce(sum(${opportunities.estimatedValue}) filter (where ${opportunities.stage} = 'closed_won'), 0)`,
        wonCount: sql<number>`count(*) filter (where ${opportunities.stage} = 'closed_won')`,
      })
      .from(opportunities)
      .where(and(eq(opportunities.organizationId, orgId), isNull(opportunities.deletedAt)));

    const [messageStats] = await db
      .select({
        sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')`,
        replied: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')`,
      })
      .from(messages)
      .where(eq(messages.organizationId, orgId));

    res.json({
      leads: leadStats,
      campaigns: campaignStats,
      opportunities: oppStats,
      messages: messageStats,
    });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/funnel', async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;
    const stages = ['new', 'contacted', 'engaging', 'warm', 'hot', 'qualified', 'converted'];
    const [row] = await db
      .select({
        new: sql<number>`count(*) filter (where ${leads.status} = 'new')`,
        contacted: sql<number>`count(*) filter (where ${leads.status} = 'contacted')`,
        engaging: sql<number>`count(*) filter (where ${leads.status} = 'engaging')`,
        warm: sql<number>`count(*) filter (where ${leads.status} = 'warm')`,
        hot: sql<number>`count(*) filter (where ${leads.status} = 'hot')`,
        qualified: sql<number>`count(*) filter (where ${leads.status} = 'qualified')`,
        converted: sql<number>`count(*) filter (where ${leads.status} = 'converted')`,
      })
      .from(leads)
      .where(and(eq(leads.organizationId, orgId), isNull(leads.deletedAt)));

    res.json({ stages, data: row });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/campaigns', async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;
    const rows = await db
      .select({
        campaignId: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        totalLeads: count(campaignLeads.id),
        replied: sql<number>`count(*) filter (where ${campaignLeads.status} = 'replied')`,
        warm: sql<number>`count(*) filter (where ${campaignLeads.status} = 'warm')`,
        qualified: sql<number>`count(*) filter (where ${campaignLeads.status} = 'qualified')`,
        converted: sql<number>`count(*) filter (where ${campaignLeads.status} = 'converted')`,
      })
      .from(campaigns)
      .leftJoin(campaignLeads, eq(campaigns.id, campaignLeads.campaignId))
      .where(and(eq(campaigns.organizationId, orgId), isNull(campaigns.deletedAt)))
      .groupBy(campaigns.id, campaigns.name, campaigns.status);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});
