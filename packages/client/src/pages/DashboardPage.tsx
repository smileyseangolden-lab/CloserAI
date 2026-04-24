import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  AlertTriangle,
  Circle,
  Flame,
  Mail,
  MailOpen,
  Target,
  Trophy,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingBlock, StatCard } from '../components/ui';
import { STAGES, STAGE_BY_ID } from '../workflow/stages';

interface DashboardData {
  leads: {
    total: number;
    newCount: number;
    warmCount: number;
    hotCount: number;
    qualifiedCount: number;
    convertedCount: number;
  };
  campaigns: { total: number; activeCount: number };
  opportunities: { total: number; openValue: number; wonValue: number; wonCount: number };
  messages: { sent: number; replied: number };
}

interface StageRow {
  id: string;
  order: number;
  title: string;
  description: string;
  status: 'locked' | 'in_progress' | 'approved';
  version: number;
  approvedAt: string | null;
  hasAgentMetrics: boolean;
  perAgent: AgentRow[];
}

interface AgentRow {
  agentId: string;
  agentName: string;
  agentType: string;
  isActive: boolean;
  sent: number;
  replied: number;
  replyRate: number;
  openRate: number;
  bounced: number;
  openOpps: number;
  wonOpps: number;
  wonValue: number;
  observed: boolean;
}

interface StagesAnalytics {
  stages: StageRow[];
  agents: Array<{ id: string; name: string; agentType: string; isActive: boolean }>;
}

interface Anomaly {
  agentId: string;
  agentName: string;
  metric: 'reply_rate' | 'open_rate' | 'bounce_rate';
  currentValue: number;
  baselineValue: number;
  relativeChange: number;
  direction: 'up' | 'down';
  severity: 'info' | 'warning' | 'critical';
  sampleSize: number;
}
interface AnomaliesResponse {
  anomalies: Anomaly[];
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardData | null>(null);
  const [stagesData, setStagesData] = useState<StagesAnalytics | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('closerai.dismissedAnomalies');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    void api.get<DashboardData>('/analytics/dashboard').then(setSummary).catch(() => setSummary(null));
    void api
      .get<StagesAnalytics>('/analytics/stages')
      .then(setStagesData)
      .catch(() => setStagesData(null));
    void api
      .get<AnomaliesResponse>('/analytics/anomalies')
      .then((r) => setAnomalies(r.anomalies))
      .catch(() => setAnomalies([]));
  }, []);

  const visibleAnomalies = anomalies.filter(
    (a) => !dismissedIds.has(anomalyKey(a)) && a.severity !== 'info',
  );

  function dismiss(a: Anomaly) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(anomalyKey(a));
      try {
        sessionStorage.setItem('closerai.dismissedAnomalies', JSON.stringify([...next]));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }

  const nextStage = useMemo(() => {
    if (!stagesData) return null;
    for (const s of stagesData.stages) {
      if (s.status !== 'approved') return s;
    }
    return null;
  }, [stagesData]);

  const approvedCount = stagesData?.stages.filter((s) => s.status === 'approved').length ?? 0;
  const totalStages = STAGES.length;

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Dashboard"
        subtitle="Workflow setup progress, agent performance by stage, and pipeline summary."
      />

      {visibleAnomalies.length > 0 && (
        <div className="mb-6 space-y-2">
          {visibleAnomalies.slice(0, 3).map((a) => (
            <AnomalyBanner key={anomalyKey(a)} anomaly={a} onDismiss={() => dismiss(a)} />
          ))}
          {visibleAnomalies.length > 3 && (
            <Link
              to="/stages/analytics"
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              +{visibleAnomalies.length - 3} more anomalies — investigate in Analytics →
            </Link>
          )}
        </div>
      )}

      <div className="card p-5 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted font-medium">
              Setup progress
            </div>
            <div className="text-2xl font-semibold mt-1 text-text-primary">
              {approvedCount} / {totalStages} stages approved
            </div>
          </div>
          {nextStage && (
            <Link
              to={`/stages/${nextStage.id}`}
              className="btn-primary self-start md:self-auto"
            >
              Continue in {nextStage.title} <ArrowRight size={14} />
            </Link>
          )}
        </div>
        <div className="flex gap-1 overflow-hidden rounded-full h-2 bg-surface-muted my-3">
          {stagesData?.stages.map((s) => (
            <div
              key={s.id}
              className={`flex-1 ${
                s.status === 'approved'
                  ? 'bg-emerald-500'
                  : s.status === 'in_progress'
                    ? 'bg-amber-400'
                    : 'bg-surface-muted'
              }`}
              title={`${s.title}: ${s.status}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stagesData?.stages.map((s) => (
            <Link
              key={s.id}
              to={`/stages/${s.id}`}
              className="text-xs px-2 py-1 rounded-full border border-border-default hover:bg-surface-muted inline-flex items-center gap-1"
            >
              <StageDot status={s.status} />
              <span className="text-text-muted">{s.order}.</span>
              {s.title}
            </Link>
          ))}
        </div>
      </div>

      <SectionHeader title="Acquisition" subtitle="Leads and pipeline coverage" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Total leads"
          value={summary?.leads.total.toLocaleString() ?? '—'}
          change={`${summary?.leads.newCount ?? 0} new`}
          sparkline={fauxSeries(summary?.leads.total ?? 0)}
          sparklineTone="brand"
        />
        <StatCard
          icon={Flame}
          label="Warm + hot"
          value={(
            (summary?.leads.warmCount ?? 0) + (summary?.leads.hotCount ?? 0)
          ).toLocaleString()}
          change={`${summary?.leads.hotCount ?? 0} hot`}
          tone="positive"
          sparkline={fauxSeries(
            (summary?.leads.warmCount ?? 0) + (summary?.leads.hotCount ?? 0),
          )}
          sparklineTone="positive"
        />
        <StatCard
          icon={Target}
          label="Qualified"
          value={(summary?.leads.qualifiedCount ?? 0).toLocaleString()}
          change={`${summary?.leads.convertedCount ?? 0} converted`}
          tone="positive"
          sparkline={fauxSeries(summary?.leads.qualifiedCount ?? 0)}
          sparklineTone="positive"
        />
        <StatCard
          icon={Circle}
          label="Active campaigns"
          value={summary?.campaigns.activeCount ?? 0}
          change={`${summary?.campaigns.total ?? 0} total`}
        />
      </div>

      <SectionHeader title="Engagement" subtitle="Outbound activity and replies" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
        <StatCard
          icon={Mail}
          label="Outbound sent"
          value={(summary?.messages.sent ?? 0).toLocaleString()}
          sparkline={fauxSeries(summary?.messages.sent ?? 0)}
          sparklineTone="brand"
        />
        <StatCard
          icon={MailOpen}
          label="Replies received"
          value={(summary?.messages.replied ?? 0).toLocaleString()}
          change={formatReplyRate(summary?.messages.sent, summary?.messages.replied)}
          tone={
            replyRateTone(summary?.messages.sent, summary?.messages.replied) ??
            'neutral'
          }
          sparkline={fauxSeries(summary?.messages.replied ?? 0)}
          sparklineTone="positive"
        />
        <StatCard
          icon={AlertTriangle}
          label="Anomalies"
          value={anomalies.filter((a) => a.severity !== 'info').length}
          change={
            anomalies.filter((a) => a.severity === 'critical').length > 0
              ? `${anomalies.filter((a) => a.severity === 'critical').length} critical`
              : 'All healthy'
          }
          tone={
            anomalies.filter((a) => a.severity === 'critical').length > 0
              ? 'negative'
              : 'positive'
          }
        />
      </div>

      <SectionHeader title="Pipeline" subtitle="Open opportunities and won revenue" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
        <StatCard
          icon={Target}
          label="Open pipeline"
          value={`$${Number(summary?.opportunities.openValue ?? 0).toLocaleString()}`}
          change={`${summary?.opportunities.total ?? 0} open opps`}
          sparkline={fauxSeries(summary?.opportunities.openValue ?? 0)}
          sparklineTone="brand"
        />
        <StatCard
          icon={Trophy}
          label="Won revenue"
          value={`$${Number(summary?.opportunities.wonValue ?? 0).toLocaleString()}`}
          change={`${summary?.opportunities.wonCount ?? 0} deals won`}
          tone="positive"
          sparkline={fauxSeries(summary?.opportunities.wonValue ?? 0)}
          sparklineTone="positive"
        />
        <StatCard
          icon={TrendingUp}
          label="Win rate"
          value={formatWinRate(
            summary?.opportunities.total,
            summary?.opportunities.wonCount,
          )}
          change="vs all open opps"
          tone="positive"
        />
      </div>

      <section className="card p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg">Performance by stage × agent</h2>
            <p className="text-sm text-text-muted">
              How each AI agent is performing across the workflow stages where activity is observed.
            </p>
          </div>
        </div>

        {stagesData === null ? (
          <LoadingBlock label="Loading agent performance…" />
        ) : stagesData.agents.length === 0 ? (
          <div className="text-sm text-text-muted py-10 text-center">
            No agents configured yet.{' '}
            <Link to="/stages/agent-builder" className="text-brand-600 font-medium">
              Build your first agent →
            </Link>
          </div>
        ) : (
          <StageAgentGrid data={stagesData} />
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-semibold text-lg mb-4">Stage snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {stagesData?.stages.map((s) => (
            <Link
              key={s.id}
              to={`/stages/${s.id}`}
              className="border border-border-default rounded-xl p-4 hover:border-brand-300 hover:bg-brand-50/40 transition"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-surface-muted text-text-secondary flex items-center justify-center flex-shrink-0">
                  <StageIcon stageId={s.id} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-text-muted">
                      Stage {s.order}
                    </div>
                    <StagePill status={s.status} />
                  </div>
                  <div className="font-medium text-text-primary truncate">{s.title}</div>
                  <div className="text-xs text-text-muted line-clamp-2 mt-0.5">{s.description}</div>
                  {s.hasAgentMetrics && (
                    <div className="text-xs mt-2 text-text-muted">
                      {summariseAgents(s.perAgent)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StageAgentGrid({ data }: { data: StagesAnalytics }) {
  const metricStages = data.stages.filter((s) => s.hasAgentMetrics);
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left sticky left-0 bg-surface z-10 pb-3 pr-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Agent
            </th>
            {metricStages.map((s) => (
              <th
                key={s.id}
                className="text-left pb-3 pr-3 text-xs font-semibold uppercase tracking-wide text-text-muted min-w-[140px]"
              >
                <div className="flex items-center gap-1.5">
                  <StageDot status={s.status} />
                  {s.order}. {s.title}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.agents.map((agent) => (
            <tr key={agent.id} className="border-t border-border-subtle">
              <td className="sticky left-0 bg-surface z-10 py-3 pr-3">
                <div className="font-medium text-text-primary">{agent.name}</div>
                <div className="text-xs text-text-muted capitalize">
                  {agent.agentType} · {agent.isActive ? 'Active' : 'Paused'}
                </div>
              </td>
              {metricStages.map((stage) => {
                const a = stage.perAgent.find((r) => r.agentId === agent.id);
                if (!a) return <td key={stage.id} className="py-3 pr-3 text-text-muted">—</td>;
                return (
                  <td key={stage.id} className="py-3 pr-3 align-top">
                    <StageAgentCell stageId={stage.id} row={a} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StageAgentCell({ stageId, row }: { stageId: string; row: AgentRow }) {
  if (stageId === 'deployment' || stageId === 'pilot') {
    if (row.sent === 0) return <span className="text-text-muted">No sends yet</span>;
    return (
      <div>
        <MetricBar label="Reply" value={row.replyRate} />
        <MetricBar label="Open" value={row.openRate} />
        <div className="text-xs text-text-muted mt-1">
          {row.sent.toLocaleString()} sent · {row.replied} replied
          {row.bounced > 0 && ` · ${row.bounced} bounced`}
        </div>
      </div>
    );
  }
  if (stageId === 'handoff' || stageId === 'optimization') {
    return (
      <div>
        <div className="text-base font-semibold text-text-primary">
          ${Number(row.wonValue).toLocaleString()}
        </div>
        <div className="text-xs text-text-muted">
          {row.wonOpps} won · {row.openOpps} open
        </div>
      </div>
    );
  }
  if (stageId === 'agent-builder') {
    return (
      <div>
        <div className="text-xs text-text-muted">
          {row.isActive ? (
            <span className="text-emerald-600 font-medium">Active</span>
          ) : (
            <span className="text-text-muted">Paused</span>
          )}
        </div>
        <div className="text-xs text-text-muted">{row.sent} msgs lifetime</div>
      </div>
    );
  }
  if (stageId === 'analytics') {
    const replyPct = (row.replyRate * 100).toFixed(1);
    return (
      <div>
        <div className="text-sm font-semibold text-text-primary">{replyPct}%</div>
        <div className="text-xs text-text-muted">reply rate</div>
      </div>
    );
  }
  return <span className="text-text-muted">—</span>;
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="mb-1">
      <div className="flex justify-between text-[10px] text-text-muted mb-0.5">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide uppercase text-text-muted">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

// Sparklines need a history series. We don't have one from the API yet, so we
// synthesise a smooth 12-point curve that lands on the current value just for
// visual shape. When a real time-series endpoint exists, drop this helper.
function fauxSeries(end: number): number[] {
  const len = 12;
  const target = Math.max(0, Number(end) || 0);
  if (target === 0) return Array(len).fill(0);
  const start = target * 0.45;
  return Array.from({ length: len }, (_, i) => {
    const t = i / (len - 1);
    const eased = start + (target - start) * Math.pow(t, 1.6);
    const jitter = Math.sin(i * 1.7) * target * 0.05;
    return Math.max(0, Math.round(eased + jitter));
  });
}

function formatReplyRate(sent?: number, replied?: number): string {
  if (!sent || sent === 0) return 'No sends yet';
  const pct = ((replied ?? 0) / sent) * 100;
  return `${pct.toFixed(1)}% reply rate`;
}

function replyRateTone(
  sent?: number,
  replied?: number,
): 'positive' | 'negative' | 'neutral' {
  if (!sent || sent === 0) return 'neutral';
  const pct = ((replied ?? 0) / sent) * 100;
  if (pct >= 5) return 'positive';
  if (pct <= 1) return 'negative';
  return 'neutral';
}

function formatWinRate(total?: number, won?: number): string {
  if (!total || total === 0) return '—';
  return `${(((won ?? 0) / total) * 100).toFixed(1)}%`;
}

function StageDot({ status }: { status: StageRow['status'] }) {
  const color =
    status === 'approved'
      ? 'bg-emerald-500'
      : status === 'in_progress'
        ? 'bg-amber-400'
        : 'bg-slate-300';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function StagePill({ status }: { status: StageRow['status'] }) {
  const styles: Record<StageRow['status'], string> = {
    locked: 'bg-surface-muted text-text-muted',
    in_progress: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
  };
  const label: Record<StageRow['status'], string> = {
    locked: 'Not started',
    in_progress: 'In progress',
    approved: 'Approved',
  };
  return <span className={`badge ${styles[status]}`}>{label[status]}</span>;
}

function StageIcon({ stageId }: { stageId: string }) {
  const def = STAGE_BY_ID[stageId];
  if (!def) return <Circle size={16} />;
  const Icon = def.icon;
  return <Icon size={16} />;
}

function summariseAgents(rows: AgentRow[]): string {
  const observed = rows.filter((r) => r.observed && r.sent > 0);
  if (observed.length === 0) return 'No agent activity yet.';
  const total = observed.reduce((a, r) => a + r.sent, 0);
  const repl = observed.reduce((a, r) => a + r.replied, 0);
  return `${observed.length} agents · ${total.toLocaleString()} sent · ${repl} replies`;
}

function anomalyKey(a: Anomaly): string {
  return `${a.agentId}:${a.metric}:${a.direction}`;
}

function AnomalyBanner({ anomaly, onDismiss }: { anomaly: Anomaly; onDismiss: () => void }) {
  const styles =
    anomaly.severity === 'critical'
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-amber-200 bg-amber-50 text-amber-900';
  const Icon = anomaly.direction === 'up' ? TrendingUp : TrendingDown;
  const metricLabel = anomaly.metric.replace(/_/g, ' ');
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const delta = (anomaly.relativeChange * 100).toFixed(0);
  const deltaSign = anomaly.relativeChange > 0 ? '+' : '';

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${styles}`}>
      <div className="mt-0.5">
        <AlertTriangle size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon size={14} />
          {anomaly.agentName} · {metricLabel} {deltaSign}
          {delta}% week-over-week
        </div>
        <div className="text-xs mt-0.5">
          Now {pct(anomaly.currentValue)} vs. {pct(anomaly.baselineValue)} the prior 7 days ·{' '}
          {anomaly.sampleSize.toLocaleString()} sends.{' '}
          <Link to="/stages/optimization" className="underline font-medium">
            Propose a fix →
          </Link>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="text-xs text-text-muted hover:text-text-primary p-1"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
