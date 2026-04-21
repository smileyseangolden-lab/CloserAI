import { useEffect, useState } from 'react';
import { Rocket, ShieldCheck, Pause, Play, AlertOctagon } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface DeploymentRow {
  id: string;
  name: string;
  description: string | null;
  assignedAgentIds: string[] | null;
  icpTierIds: string[] | null;
  campaignIds: string[] | null;
  status: 'draft' | 'pending_pilot' | 'live' | 'paused' | 'completed';
  killSwitchActivatedAt: string | null;
  launchedAt: string | null;
  settings: Record<string, unknown>;
}

interface ComplianceRow {
  id: string;
  jurisdiction: string;
  ruleType: string;
  title: string;
  description: string | null;
  enabled: boolean;
}

interface CadenceStep {
  channel: string;
  delayDays?: number;
  delayHours?: number;
  subject?: string;
  body?: string;
}

export function DeploymentStage() {
  const stage = STAGE_BY_ID['deployment']!;
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [rules, setRules] = useState<ComplianceRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void Promise.all([
      api.get<DeploymentRow[]>('/deployments'),
      api.get<ComplianceRow[]>('/deployments/compliance/rules'),
    ])
      .then(([d, r]) => {
        setDeployments(d);
        setRules(r);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  async function kill(id: string) {
    const reason = prompt('Reason for activating the kill switch?') ?? 'manual';
    await api.post(`/deployments/${id}/kill`, { reason });
    setRefreshKey((k) => k + 1);
  }

  async function resume(id: string) {
    if (!confirm('Resume this deployment? It will go live immediately.')) return;
    await api.post(`/deployments/${id}/resume`, {});
    setRefreshKey((k) => k + 1);
  }

  return (
    <StepAssistant
      key={`dep-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              <Rocket size={12} /> Deployments · {deployments.length}
            </div>
            {deployments.length === 0 && (
              <div className="text-xs text-slate-400">
                Approve a draft and the assistant writes a deployments row that
                bundles your agents, ICPs and cadences.
              </div>
            )}
            {deployments.map((d) => {
              const cadences = (d.settings?.cadences as CadenceStep[] | undefined) ?? [];
              return (
                <div
                  key={d.id}
                  className="bg-white rounded-lg border border-slate-200 p-3 mb-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{d.name}</div>
                      <div className="text-xs text-slate-500">
                        {(d.assignedAgentIds ?? []).length} agents ·{' '}
                        {(d.icpTierIds ?? []).length} ICP tiers ·{' '}
                        {(d.campaignIds ?? []).length} campaigns
                      </div>
                    </div>
                    <DepStatus status={d.status} />
                  </div>
                  {d.killSwitchActivatedAt && (
                    <div className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <AlertOctagon size={12} /> Kill switch active since{' '}
                      {new Date(d.killSwitchActivatedAt).toLocaleString()}
                    </div>
                  )}
                  {cadences.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                        Cadence ({cadences.length} steps)
                      </div>
                      <ol className="space-y-1">
                        {cadences.slice(0, 6).map((c, i) => (
                          <li
                            key={i}
                            className="text-xs flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded"
                          >
                            <span className="font-mono text-slate-400 w-6">#{i + 1}</span>
                            <span className="badge bg-brand-50 text-brand-700 text-[10px] capitalize">
                              {c.channel?.replace(/_/g, ' ') ?? 'step'}
                            </span>
                            {(c.delayDays || c.delayHours) && (
                              <span className="text-slate-500">
                                wait {c.delayDays ?? 0}d {c.delayHours ?? 0}h
                              </span>
                            )}
                            {c.subject && (
                              <span className="truncate text-slate-700">{c.subject}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                      {cadences.length > 6 && (
                        <div className="text-xs text-slate-400 mt-1">
                          + {cadences.length - 6} more steps
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    {d.status === 'paused' || d.killSwitchActivatedAt ? (
                      <button className="btn-secondary" onClick={() => resume(d.id)}>
                        <Play size={12} /> Resume
                      </button>
                    ) : (
                      <button
                        className="btn-secondary text-red-600 hover:bg-red-50"
                        onClick={() => kill(d.id)}
                      >
                        <Pause size={12} /> Kill switch
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              <ShieldCheck size={12} /> Compliance · {rules.length} rules
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {rules.length === 0 && (
                <div className="text-xs text-slate-400">
                  Approval seeds CAN-SPAM, GDPR, CCPA and LinkedIn ToS defaults.
                </div>
              )}
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="text-xs bg-white border border-slate-200 rounded px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{r.title}</span>
                    {r.enabled ? (
                      <span className="text-emerald-600">on</span>
                    ) : (
                      <span className="text-slate-400">off</span>
                    )}
                  </div>
                  <div className="text-slate-500 capitalize">
                    {r.jurisdiction.replace(/_/g, ' ')} · {r.ruleType.replace(/_/g, ' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}

function DepStatus({ status }: { status: DeploymentRow['status'] }) {
  const styles: Record<DeploymentRow['status'], string> = {
    draft: 'bg-slate-100 text-slate-500',
    pending_pilot: 'bg-amber-100 text-amber-700',
    live: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-red-100 text-red-700',
    completed: 'bg-slate-100 text-slate-500',
  };
  return <span className={`badge ${styles[status]} capitalize`}>{status.replace(/_/g, ' ')}</span>;
}
