import { useEffect, useState } from 'react';
import { Wand2, Beaker, Check, X, Play, StopCircle, Power, Zap, ShieldCheck } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';
import { ManagersPanel } from './ManagersPanel';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PromptDialog,
  toast,
} from '../../../components/ui';

interface ProposalRow {
  id: string;
  proposalType: string;
  targetResourceType: string;
  targetResourceId: string | null;
  title: string;
  description: string;
  rationale: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  expectedImpact: string | null;
  status: 'pending' | 'approved' | 'dismissed' | 'applied';
  appliedAt: string | null;
  dismissedAt: string | null;
}

interface ExperimentRow {
  id: string;
  name: string;
  hypothesis: string | null;
  metric: string;
  status: 'draft' | 'running' | 'completed' | 'stopped';
  startedAt: string | null;
  endedAt: string | null;
  winningVariant: 'A' | 'B' | null;
  targetSampleSize: number;
}

interface SchedulerState {
  enabled: boolean;
  lastProposalAt: string | null;
}

export function OptimizationStage() {
  const stage = STAGE_BY_ID['optimization']!;
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<'proposals' | 'experiments' | 'managers'>('proposals');
  const [dismissTarget, setDismissTarget] = useState<ProposalRow | null>(null);
  const [dismissBusy, setDismissBusy] = useState(false);
  const [stopExpTarget, setStopExpTarget] = useState<ExperimentRow | null>(null);
  const [stopExpBusy, setStopExpBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.get<ProposalRow[]>('/optimization/proposals'),
      api.get<ExperimentRow[]>('/optimization/experiments'),
      api.get<SchedulerState>('/optimization/scheduler'),
    ])
      .then(([p, e, s]) => {
        setProposals(p);
        setExperiments(e);
        setScheduler(s);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  async function toggleScheduler() {
    if (!scheduler) return;
    const next = !scheduler.enabled;
    setScheduler({ ...scheduler, enabled: next });
    await api.patch('/optimization/scheduler', { enabled: next });
  }

  async function runNow() {
    setRunBusy(true);
    try {
      await api.post('/optimization/scheduler/run-now', {});
      // Give the worker ~20s to produce proposals, then refetch.
      setTimeout(() => setRefreshKey((k) => k + 1), 20_000);
    } finally {
      setRunBusy(false);
    }
  }

  async function approve(id: string) {
    try {
      await api.post(`/optimization/proposals/${id}/approve`, {});
      toast.success('Proposal approved');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approve failed');
    }
  }
  async function submitDismiss(reason: string) {
    if (!dismissTarget) return;
    setDismissBusy(true);
    try {
      await api.post(`/optimization/proposals/${dismissTarget.id}/dismiss`, {
        reason: reason.trim(),
      });
      toast.success('Proposal dismissed');
      setDismissTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Dismiss failed');
    } finally {
      setDismissBusy(false);
    }
  }
  async function startExp(id: string) {
    try {
      await api.post(`/optimization/experiments/${id}/start`, {});
      toast.success('Experiment started');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start experiment');
    }
  }
  async function submitStopExp(winner: 'A' | 'B' | null) {
    if (!stopExpTarget) return;
    setStopExpBusy(true);
    try {
      await api.post(`/optimization/experiments/${stopExpTarget.id}/stop`, {
        winningVariant: winner ?? undefined,
      });
      toast.success(
        winner ? `Experiment stopped — variant ${winner} won` : 'Experiment stopped',
      );
      setStopExpTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Stop failed');
    } finally {
      setStopExpBusy(false);
    }
  }

  const pending = proposals.filter((p) => p.status === 'pending');
  const resolved = proposals.filter((p) => p.status !== 'pending');

  return (
    <>
    <StepAssistant
      key={`opt-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          {scheduler && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Power size={12} /> Continuous optimization
                  </div>
                  <div className="text-sm text-slate-700 mt-1">
                    {scheduler.enabled
                      ? 'Running every ~6 hours — proposals drop here automatically.'
                      : 'Paused — enable to let the scheduler propose changes for you.'}
                  </div>
                  {scheduler.lastProposalAt && (
                    <div className="text-xs text-slate-500 mt-1">
                      last proposal {new Date(scheduler.lastProposalAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <button
                  className={`btn-secondary text-xs ${
                    scheduler.enabled ? 'text-emerald-700 border-emerald-200' : ''
                  }`}
                  onClick={toggleScheduler}
                >
                  {scheduler.enabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  className="btn-primary text-xs w-full justify-center"
                  disabled={runBusy}
                  onClick={runNow}
                >
                  <Zap size={12} /> {runBusy ? 'Queued…' : 'Run analysis now'}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-1 border-b border-slate-200 -mb-px">
            <TabBtn active={tab === 'proposals'} onClick={() => setTab('proposals')}>
              <Wand2 size={12} /> Proposals
              {pending.length > 0 && (
                <span className="ml-1 text-[10px] bg-brand-500 text-white rounded-full px-1.5">
                  {pending.length}
                </span>
              )}
            </TabBtn>
            <TabBtn active={tab === 'experiments'} onClick={() => setTab('experiments')}>
              <Beaker size={12} /> Experiments
              {experiments.length > 0 && (
                <span className="ml-1 text-[10px] text-slate-500">{experiments.length}</span>
              )}
            </TabBtn>
            <TabBtn active={tab === 'managers'} onClick={() => setTab('managers')}>
              <ShieldCheck size={12} /> Managers
            </TabBtn>
          </div>

          {tab === 'managers' ? (
            <ManagersPanel />
          ) : tab === 'proposals' ? (
            <div className="space-y-3">
              {pending.length === 0 && resolved.length === 0 && (
                <div className="text-xs text-slate-400 px-1">
                  Ask the assistant to analyse pipeline performance and propose changes. Approving
                  a proposal writes-back into Stage 3 (agents), Stage 4 (ICP), or Stage 6
                  (knowledge) automatically.
                </div>
              )}
              {pending.map((p) => (
                <ProposalCard
                  key={p.id}
                  p={p}
                  onApprove={approve}
                  onDismiss={(proposal) => setDismissTarget(proposal)}
                />
              ))}
              {resolved.length > 0 && (
                <details className="text-xs">
                  <summary className="text-slate-500 cursor-pointer">
                    {resolved.length} resolved proposals
                  </summary>
                  <div className="mt-2 space-y-2">
                    {resolved.map((p) => (
                      <div
                        key={p.id}
                        className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-700">{p.title}</span>
                          <span
                            className={
                              p.status === 'applied'
                                ? 'text-emerald-600'
                                : p.status === 'dismissed'
                                  ? 'text-slate-400'
                                  : 'text-amber-600'
                            }
                          >
                            {p.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {experiments.length === 0 && (
                <div className="text-xs text-slate-400 px-1">
                  No experiments yet. Ask the assistant to design an A/B test.
                </div>
              )}
              {experiments.map((e) => (
                <div
                  key={e.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{e.name}</div>
                      <div className="text-xs text-slate-500">
                        Metric: <span className="font-mono">{e.metric}</span> · target n=
                        {e.targetSampleSize}
                      </div>
                      {e.hypothesis && (
                        <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {e.hypothesis}
                        </div>
                      )}
                      {e.winningVariant && (
                        <div className="text-xs text-emerald-700 mt-1">
                          🏆 Variant {e.winningVariant} won
                        </div>
                      )}
                    </div>
                    <ExperimentStatus status={e.status} />
                  </div>
                  <div className="flex gap-2 mt-2">
                    {e.status === 'draft' && (
                      <button className="btn-secondary text-xs" onClick={() => startExp(e.id)}>
                        <Play size={12} /> Start
                      </button>
                    )}
                    {e.status === 'running' && (
                      <button className="btn-secondary text-xs" onClick={() => setStopExpTarget(e)}>
                        <StopCircle size={12} /> Stop
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      }
    />
    <PromptDialog
      open={dismissTarget !== null}
      onOpenChange={(open) => {
        if (!open) setDismissTarget(null);
      }}
      title="Dismiss this proposal?"
      description={
        dismissTarget ? (
          <>
            We'll hide <strong>{dismissTarget.title}</strong> and log why. The assistant won't
            re-suggest it unless something changes.
          </>
        ) : null
      }
      label="Reason (optional)"
      placeholder="e.g. already tried, not aligned with current ICP…"
      confirmLabel="Dismiss"
      loading={dismissBusy}
      onConfirm={submitDismiss}
    />
    <StopExperimentDialog
      experiment={stopExpTarget}
      loading={stopExpBusy}
      onClose={() => setStopExpTarget(null)}
      onConfirm={submitStopExp}
    />
    </>
  );
}

function StopExperimentDialog({
  experiment,
  loading,
  onClose,
  onConfirm,
}: {
  experiment: ExperimentRow | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (winner: 'A' | 'B' | null) => void;
}) {
  const [winner, setWinner] = useState<'A' | 'B' | ''>('');
  useEffect(() => {
    setWinner('');
  }, [experiment?.id]);
  return (
    <Dialog
      open={experiment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop experiment</DialogTitle>
          <DialogDescription>
            {experiment ? (
              <>
                Declare a winner for <strong>{experiment.name}</strong>, or stop without one.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex gap-2">
            {(['A', 'B'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setWinner(v)}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  winner === v
                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                Variant {v} won
              </button>
            ))}
            <button
              type="button"
              onClick={() => setWinner('')}
              className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
                winner === ''
                  ? 'border-slate-400 bg-slate-50 text-slate-700'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              No winner
            </button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(winner === '' ? null : winner)}
            loading={loading}
          >
            Stop experiment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalCard({
  p,
  onApprove,
  onDismiss,
}: {
  p: ProposalRow;
  onApprove: (id: string) => Promise<void>;
  onDismiss: (p: ProposalRow) => void;
}) {
  const [busy, setBusy] = useState<'approve' | null>(null);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="badge bg-brand-50 text-brand-700 capitalize">
          {p.proposalType.replace(/_/g, ' ')}
        </span>
        <span className="text-xs text-slate-500">→ {p.targetResourceType}</span>
      </div>
      <div className="font-semibold text-slate-900">{p.title}</div>
      <div className="text-sm text-slate-700 mt-1">{p.description}</div>
      {p.rationale && (
        <div className="text-xs text-slate-600 italic mt-2">{p.rationale}</div>
      )}
      {p.expectedImpact && (
        <div className="text-xs mt-1">
          <span className="font-medium text-slate-700">Expected impact:</span>{' '}
          <span className="text-slate-600">{p.expectedImpact}</span>
        </div>
      )}
      {(p.beforeValue || p.afterValue) && (
        <details className="text-xs mt-2">
          <summary className="text-slate-500 cursor-pointer">before / after</summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div>
              <div className="text-[10px] text-slate-500 mb-1">BEFORE</div>
              <pre className="bg-slate-50 rounded p-2 overflow-auto max-h-32">
                {JSON.stringify(p.beforeValue ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 mb-1">AFTER</div>
              <pre className="bg-emerald-50 rounded p-2 overflow-auto max-h-32">
                {JSON.stringify(p.afterValue ?? null, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      )}
      <div className="flex gap-2 mt-3">
        <button
          className="btn-primary"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('approve');
            try {
              await onApprove(p.id);
            } finally {
              setBusy(null);
            }
          }}
        >
          <Check size={14} /> {busy === 'approve' ? 'Applying…' : 'Approve & apply'}
        </button>
        <button
          className="btn-secondary"
          disabled={busy !== null}
          onClick={() => onDismiss(p)}
        >
          <X size={14} /> Dismiss
        </button>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
        active
          ? 'border-brand-500 text-brand-700'
          : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function ExperimentStatus({ status }: { status: ExperimentRow['status'] }) {
  const styles: Record<ExperimentRow['status'], string> = {
    draft: 'bg-slate-100 text-slate-500',
    running: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    stopped: 'bg-red-100 text-red-700',
  };
  return <span className={`badge ${styles[status]} capitalize`}>{status}</span>;
}
