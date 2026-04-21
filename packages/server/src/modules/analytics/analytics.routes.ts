import { Router } from 'express';
import { and, eq, gte, isNull, sql, count } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  leads,
  campaigns,
  opportunities,
  messages,
  campaignLeads,
  agentProfiles,
  workspaceStages,
} from '../../db/schema.js';
import { STAGE_DEFINITIONS } from '../workspace/workspace.stages.js';

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

/**
 * Per-stage × per-agent performance matrix. Powers the new Dashboard.
 *
 * Stages 1–9 are workflow stages: we return their workspace status + version.
 * Stages 10 (Analytics) and 11 (Optimization) are always "live"; we return
 * zeros/totals there.
 *
 * For each stage we also attach per-agent rollups when the stage has
 * observable agent activity (e.g. messages sent under deployment / pilot).
 */
analyticsRouter.get('/stages', async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;

    const stages = await db
      .select()
      .from(workspaceStages)
      .where(eq(workspaceStages.organizationId, orgId));
    const stageByKey = new Map(stages.map((s) => [s.stageId, s]));

    const agents = await db
      .select({
        id: agentProfiles.id,
        name: agentProfiles.name,
        agentType: agentProfiles.agentType,
        isActive: agentProfiles.isActive,
      })
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.organizationId, orgId),
          isNull(agentProfiles.deletedAt),
        ),
      );

    const agentRollups = await db
      .select({
        agentId: messages.agentId,
        sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')`,
        delivered: sql<number>`count(*) filter (where ${messages.status} = 'delivered')`,
        opened: sql<number>`count(*) filter (where ${messages.openedAt} is not null)`,
        replied: sql<number>`count(*) filter (where ${messages.repliedAt} is not null)`,
        bounced: sql<number>`count(*) filter (where ${messages.bouncedAt} is not null)`,
      })
      .from(messages)
      .where(eq(messages.organizationId, orgId))
      .groupBy(messages.agentId);
    const agentRollupsById = new Map(
      agentRollups.filter((r) => r.agentId).map((r) => [r.agentId as string, r]),
    );

    const agentOpps = await db
      .select({
        agentId: opportunities.assignedAgentId,
        open: sql<number>`count(*) filter (where ${opportunities.stage} not in ('closed_won','closed_lost'))`,
        won: sql<number>`count(*) filter (where ${opportunities.stage} = 'closed_won')`,
        wonValue: sql<number>`coalesce(sum(${opportunities.estimatedValue}) filter (where ${opportunities.stage} = 'closed_won'), 0)`,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.organizationId, orgId),
          isNull(opportunities.deletedAt),
        ),
      )
      .groupBy(opportunities.assignedAgentId);
    const agentOppsById = new Map(
      agentOpps.filter((r) => r.agentId).map((r) => [r.agentId as string, r]),
    );

    const stagesResponse = STAGE_DEFINITIONS.map((def) => {
      const ws = stageByKey.get(def.id);

      // Only a few stages have observable per-agent metrics. For the rest,
      // we still return the agent list so the UI can render a consistent grid.
      const stagesWithAgentMetrics = new Set([
        'agent-builder',
        'deployment',
        'pilot',
        'handoff',
        'analytics',
        'optimization',
      ]);

      const perAgent = agents.map((a) => {
        const msgs = agentRollupsById.get(a.id);
        const opps = agentOppsById.get(a.id);
        const sent = Number(msgs?.sent ?? 0);
        const replied = Number(msgs?.replied ?? 0);
        const replyRate = sent > 0 ? replied / sent : 0;

        if (!stagesWithAgentMetrics.has(def.id)) {
          return {
            agentId: a.id,
            agentName: a.name,
            agentType: a.agentType,
            isActive: a.isActive,
            sent: 0,
            replied: 0,
            replyRate: 0,
            openRate: 0,
            bounced: 0,
            openOpps: 0,
            wonOpps: 0,
            wonValue: 0,
            observed: false,
          };
        }

        return {
          agentId: a.id,
          agentName: a.name,
          agentType: a.agentType,
          isActive: a.isActive,
          sent,
          replied,
          replyRate,
          openRate: sent > 0 ? Number(msgs?.opened ?? 0) / sent : 0,
          bounced: Number(msgs?.bounced ?? 0),
          openOpps: Number(opps?.open ?? 0),
          wonOpps: Number(opps?.won ?? 0),
          wonValue: Number(opps?.wonValue ?? 0),
          observed: true,
        };
      });

      return {
        id: def.id,
        order: def.order,
        title: def.title,
        description: def.description,
        status: ws?.status ?? 'locked',
        version: ws?.version ?? 0,
        approvedAt: ws?.approvedAt ?? null,
        hasAgentMetrics: stagesWithAgentMetrics.has(def.id),
        perAgent,
      };
    });

    res.json({
      stages: stagesResponse,
      agents,
    });
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

/**
 * Proactive anomaly detector. For each agent we compare the last 7 days to
 * the prior 7 days on three metrics (reply rate, open rate, bounce rate) and
 * flag movements that cross a relative-change threshold with enough volume
 * to matter.
 *
 * Returned shape is intentionally simple so the dashboard can render it as
 * a banner without further processing.
 */
analyticsRouter.get('/anomalies', async (req, res, next) => {
  try {
    const orgId = req.auth!.organizationId;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const rollup = async (since: Date, until?: Date) => {
      const rows = await db
        .select({
          agentId: messages.agentId,
          sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')`,
          opened: sql<number>`count(*) filter (where ${messages.openedAt} is not null)`,
          replied: sql<number>`count(*) filter (where ${messages.repliedAt} is not null)`,
          bounced: sql<number>`count(*) filter (where ${messages.bouncedAt} is not null)`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.organizationId, orgId),
            gte(messages.createdAt, since),
            until ? sql`${messages.createdAt} < ${until}` : sql`true`,
          ),
        )
        .groupBy(messages.agentId);
      const map = new Map<string, { sent: number; opened: number; replied: number; bounced: number }>();
      for (const r of rows) {
        if (!r.agentId) continue;
        map.set(r.agentId, {
          sent: Number(r.sent ?? 0),
          opened: Number(r.opened ?? 0),
          replied: Number(r.replied ?? 0),
          bounced: Number(r.bounced ?? 0),
        });
      }
      return map;
    };

    const current = await rollup(sevenDaysAgo);
    const baseline = await rollup(fourteenDaysAgo, sevenDaysAgo);

    const agents = await db
      .select({ id: agentProfiles.id, name: agentProfiles.name })
      .from(agentProfiles)
      .where(
        and(eq(agentProfiles.organizationId, orgId), isNull(agentProfiles.deletedAt)),
      );
    const agentNames = new Map(agents.map((a) => [a.id, a.name]));

    interface Anomaly {
      agentId: string;
      agentName: string;
      metric: 'reply_rate' | 'open_rate' | 'bounce_rate';
      currentValue: number;
      baselineValue: number;
      relativeChange: number; // positive = up, negative = down
      direction: 'up' | 'down';
      severity: 'info' | 'warning' | 'critical';
      sampleSize: number;
    }

    const anomalies: Anomaly[] = [];
    for (const [agentId, cur] of current.entries()) {
      const base = baseline.get(agentId) ?? { sent: 0, opened: 0, replied: 0, bounced: 0 };
      if (cur.sent < 10 || base.sent < 10) continue; // need volume

      const rate = (num: number, denom: number) => (denom === 0 ? 0 : num / denom);
      const curReply = rate(cur.replied, cur.sent);
      const baseReply = rate(base.replied, base.sent);
      const curOpen = rate(cur.opened, cur.sent);
      const baseOpen = rate(base.opened, base.sent);
      const curBounce = rate(cur.bounced, cur.sent);
      const baseBounce = rate(base.bounced, base.sent);

      const push = (
        metric: Anomaly['metric'],
        currentValue: number,
        baselineValue: number,
        badIsUp: boolean,
      ) => {
        if (baselineValue === 0 && currentValue === 0) return;
        const relativeChange =
          baselineValue === 0 ? (currentValue > 0 ? 1 : 0) : (currentValue - baselineValue) / baselineValue;
        const abs = Math.abs(relativeChange);
        if (abs < 0.25) return; // threshold
        const direction: 'up' | 'down' = relativeChange > 0 ? 'up' : 'down';
        const badDirection = badIsUp ? direction === 'up' : direction === 'down';
        const severity: Anomaly['severity'] = !badDirection
          ? 'info'
          : abs >= 0.5
            ? 'critical'
            : 'warning';
        anomalies.push({
          agentId,
          agentName: agentNames.get(agentId) ?? 'Unknown',
          metric,
          currentValue,
          baselineValue,
          relativeChange,
          direction,
          severity,
          sampleSize: cur.sent,
        });
      };

      push('reply_rate', curReply, baseReply, false);
      push('open_rate', curOpen, baseOpen, false);
      push('bounce_rate', curBounce, baseBounce, true);
    }

    // Sort: critical first, then warnings, then info; within group by abs change desc.
    const rank: Record<Anomaly['severity'], number> = { critical: 0, warning: 1, info: 2 };
    anomalies.sort((a, b) => {
      if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
      return Math.abs(b.relativeChange) - Math.abs(a.relativeChange);
    });

    res.json({
      window: { currentStart: sevenDaysAgo, baselineStart: fourteenDaysAgo },
      anomalies,
    });
  } catch (err) {
    next(err);
  }
});
