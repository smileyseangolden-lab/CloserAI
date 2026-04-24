import type { ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, AlertTriangle, Circle, Mail, Target, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingBlock, Skeleton } from '../components/ui';
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-text-muted font-medium">
                Setup progress
              </div>
              <div className="text-2xl font-semibold mt-1">
                {approvedCount} / {totalStages} stages approved
              </div>
            </div>
            {nextStage && (
              <Link to={`/stages/${nextStage.id}`} className="btn-primary">
                Continue in {nextStage.title} <ArrowRight size={14} />
              </Link>
            )}
          </div>
          <div className="flex gap-1 overflow-hidden rounded-full h-2 bg-surface-muted mb-3">
            {stagesData?.stages.map((s) => (
              <div
                key={s.id}
                className={`flex-1 ${
                  s.status === 'approved'
                    ? 'bg-emerald-500'
                    : s.status === 'in_progress'
                      ? 'bg-amber-400'
                      : 'bg-slate-200'
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

        <div className="grid grid-cols-1 gap-3">
          <MiniStat
            icon={Users}
            label="Leads"
            value={summary?.leads.total ?? 0}
            hint={`${summary?.leads.warmCount ?? 0} warm · ${summary?.leads.hotCount ?? 0} hot`}
          />
          <MiniStat
            icon={Target}
            label="Open pipeline"
            value={`$${Number(summary?.opportunities.openValue ?? 0).toLocaleString()}`}
            hint={`${summary?.opportunities.total ?? 0} opps · ${summary?.opportunities.wonCount ?? 0} won`}
          />
          <MiniStat
            icon={Mail}
            label="Outbound sent"
            value={summary?.messages.sent ?? 0}
            hint={`${summary?.messages.replied ?? 0} replies`}
          />
        </div>
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

function MiniStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-text-muted font-medium">{label}</div>
        <div className="text-xl font-semibold truncate">{value}</div>
        <div className="text-xs text-text-muted truncate">{hint}</div>
      </div>
    </div>
  );
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
