import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  Activity,
  BarChart3,
  ListOrdered,
  Mail,
  Pause,
  Play,
  Workflow,
} from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import {
  EmptyState,
  LoadingBlock,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Timeline,
  type TimelineItem,
  toast,
} from '../components/ui';

interface CadenceStep {
  id: string;
  stepNumber: number;
  channel: string;
  delayDays: number;
  delayHours: number;
  subjectTemplate: string | null;
  bodyTemplate: string;
  aiPersonalizationEnabled: boolean;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  strategy: string;
  campaignType: string;
  steps: CadenceStep[];
}

interface CampaignActivity {
  id: string;
  activityType: string;
  description: string;
  createdAt: string;
}

export function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [activities, setActivities] = useState<CampaignActivity[]>([]);

  useEffect(() => {
    if (!id) return;
    void api.get<Campaign>(`/campaigns/${id}`).then(setCampaign);
    void api
      .get<CampaignActivity[]>(`/activities?campaignId=${id}`)
      .then(setActivities)
      .catch(() => setActivities([]));
  }, [id]);

  async function toggle() {
    if (!campaign || !id) return;
    const path = campaign.status === 'active' ? 'pause' : 'start';
    try {
      const updated = await api.post<Campaign>(`/campaigns/${id}/${path}`);
      setCampaign({ ...campaign, status: updated.status });
      toast.success(
        updated.status === 'active' ? 'Campaign started' : 'Campaign paused',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update campaign');
    }
  }

  if (!campaign) {
    return <LoadingBlock label="Loading campaign…" className="min-h-[60vh]" />;
  }

  const canStart = campaign.status !== 'active';
  const messages = activities.filter((a) =>
    /email|message|reply|sms|linkedin|send/i.test(a.activityType),
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.campaignType.replace(/_/g, ' ')} • ${campaign.strategy}`}
        actions={
          <button
            className={canStart ? 'btn-primary' : 'btn-secondary'}
            onClick={toggle}
          >
            {canStart ? <Play size={16} /> : <Pause size={16} />}
            {canStart ? 'Start campaign' : 'Pause'}
          </button>
        }
      />

      <div className="card p-4 md:p-6">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              <Workflow size={14} /> Overview
            </TabsTrigger>
            <TabsTrigger value="cadence">
              <ListOrdered size={14} /> Cadence
              {campaign.steps.length > 0 && (
                <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                  {campaign.steps.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="messages">
              <Mail size={14} /> Messages
              {messages.length > 0 && (
                <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                  {messages.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity size={14} /> Activity
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 size={14} /> Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard
                label="Status"
                value={campaign.status.replace(/_/g, ' ')}
              />
              <SummaryCard label="Strategy" value={campaign.strategy} />
              <SummaryCard label="Type" value={campaign.campaignType.replace(/_/g, ' ')} />
            </div>
            {campaign.description && (
              <div className="mt-6">
                <div className="label">Description</div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">
                  {campaign.description}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cadence">
            {campaign.steps.length === 0 ? (
              <EmptyState
                compact
                icon={ListOrdered}
                title="No cadence steps yet"
                description="Add steps to define how this campaign sequences outreach over time."
              />
            ) : (
              <div className="space-y-4">
                {campaign.steps.map((step) => (
                  <div
                    key={step.id}
                    className="border border-border-default rounded-xl p-4 flex gap-4"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-semibold dark:bg-brand-500/15 dark:text-brand-300">
                      {step.stepNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="badge bg-surface-muted text-text-primary capitalize">
                          {step.channel.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-text-muted">
                          Wait {step.delayDays}d {step.delayHours}h
                        </span>
                        {step.aiPersonalizationEnabled && (
                          <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                            AI personalized
                          </span>
                        )}
                      </div>
                      {step.subjectTemplate && (
                        <div className="text-sm font-medium mb-1 text-text-primary">
                          Subject: {step.subjectTemplate}
                        </div>
                      )}
                      <div className="text-sm text-text-secondary whitespace-pre-wrap">
                        {step.bodyTemplate}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="messages">
            {messages.length === 0 ? (
              <EmptyState
                compact
                icon={Mail}
                title="No messages yet"
                description="Sends, opens, replies, and bounces will appear here as the cadence runs."
              />
            ) : (
              <Timeline items={activitiesToTimeline(messages)} />
            )}
          </TabsContent>

          <TabsContent value="activity">
            {activities.length === 0 ? (
              <EmptyState
                compact
                icon={Activity}
                title="No activity yet"
                description="Pauses, resumes, compliance events, and other campaign-level signals will show up here."
              />
            ) : (
              <Timeline items={activitiesToTimeline(activities)} />
            )}
          </TabsContent>

          <TabsContent value="analytics">
            {id && <CampaignAnalyticsPanel campaignId={id} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

interface CampaignAnalytics {
  funnel: {
    totalLeads: number;
    replied: number;
    warm: number;
    qualified: number;
    converted: number;
    unsubscribed: number;
  };
  messages: {
    totals: { sent: number; opened: number; replied: number; bounced: number };
    byChannel: Array<{
      channel: string;
      sent: number;
      opened: number;
      replied: number;
      bounced: number;
    }>;
  };
  steps: Array<{ id: string; stepNumber: number; channel: string; isActive: boolean }>;
}

function CampaignAnalyticsPanel({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .get<CampaignAnalytics>(`/campaigns/${campaignId}/analytics`)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border-default p-3 animate-pulse"
            >
              <div className="h-3 w-20 rounded bg-surface-muted/70" />
              <div className="mt-2 h-6 w-12 rounded bg-surface-muted/70" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        compact
        icon={BarChart3}
        title="No analytics yet"
        description="Once the campaign starts sending, funnel and message metrics will show up here."
      />
    );
  }

  const f = data.funnel;
  const m = data.messages.totals;
  const replyRate = m.sent > 0 ? ((m.replied / m.sent) * 100).toFixed(1) : '0.0';
  const openRate = m.sent > 0 ? ((m.opened / m.sent) * 100).toFixed(1) : '0.0';
  const bounceRate = m.sent > 0 ? ((m.bounced / m.sent) * 100).toFixed(1) : '0.0';
  const convertRate =
    f.totalLeads > 0 ? ((f.converted / f.totalLeads) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      <section>
        <div className="label mb-2">Funnel</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Leads" value={f.totalLeads} />
          <Stat label="Replied" value={f.replied} hint={`${replyRate}% reply rate`} />
          <Stat label="Warm" value={f.warm} />
          <Stat label="Qualified" value={f.qualified} />
          <Stat
            label="Converted"
            value={f.converted}
            hint={`${convertRate}% of leads`}
            tone="positive"
          />
        </div>
      </section>

      <section>
        <div className="label mb-2">Messages</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Sent" value={m.sent} />
          <Stat label="Opened" value={m.opened} hint={`${openRate}%`} />
          <Stat label="Replied" value={m.replied} hint={`${replyRate}%`} tone="positive" />
          <Stat
            label="Bounced"
            value={m.bounced}
            hint={`${bounceRate}%`}
            tone={m.bounced > 0 ? 'negative' : 'neutral'}
          />
        </div>
      </section>

      {data.messages.byChannel.length > 0 && (
        <section>
          <div className="label mb-2">By channel</div>
          <div className="rounded-xl border border-border-default overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/60 text-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Channel</th>
                  <th className="text-right px-3 py-2 font-medium">Sent</th>
                  <th className="text-right px-3 py-2 font-medium">Opened</th>
                  <th className="text-right px-3 py-2 font-medium">Replied</th>
                  <th className="text-right px-3 py-2 font-medium">Bounced</th>
                </tr>
              </thead>
              <tbody>
                {data.messages.byChannel.map((row) => (
                  <tr
                    key={row.channel}
                    className="border-t border-border-subtle text-text-primary"
                  >
                    <td className="px-3 py-2 capitalize">
                      {row.channel.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.sent}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.opened}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.replied}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.bounced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.steps.length > 0 && (
        <p className="text-xs text-text-muted">
          Per-step breakdown isn't computed yet — messages aren't stamped with a cadence step
          id. The Cadence tab shows the step list.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const hintClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-red-600 dark:text-red-400'
        : 'text-text-muted';
  return (
    <div className="rounded-lg border border-border-default p-3">
      <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
        {label}
      </div>
      <div className="text-2xl font-semibold text-text-primary tabular-nums mt-1">
        {value.toLocaleString()}
      </div>
      {hint && <div className={`text-xs mt-0.5 ${hintClass}`}>{hint}</div>}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-default p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-text-primary capitalize">{value}</div>
    </div>
  );
}

function activitiesToTimeline(activities: CampaignActivity[]): TimelineItem[] {
  return activities.map((a) => ({
    id: a.id,
    title: prettyLabel(a.activityType),
    description: a.description,
    timestamp: a.createdAt,
    tone: inferTone(a.activityType),
  }));
}

function prettyLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferTone(type: string): TimelineItem['tone'] {
  if (/reply|won|converted|qualified|resume|start/i.test(type)) return 'positive';
  if (/bounce|fail|error|kill|block|pause/i.test(type)) return 'critical';
  if (/warn|risk/i.test(type)) return 'warning';
  if (/sent|created|opened|clicked|enqueued/i.test(type)) return 'brand';
  return 'neutral';
}
