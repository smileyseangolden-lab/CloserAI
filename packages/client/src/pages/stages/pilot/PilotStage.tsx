import { useEffect, useState } from 'react';
import { Play, ShieldCheck, AlertOctagon, ThumbsUp, ThumbsDown } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface PilotRunRow {
  id: string;
  status: 'pending' | 'running' | 'ready_for_review' | 'approved' | 'blocked';
  sampleSize: number;
  goNoGo: 'go' | 'no_go' | null;
  reasoning: string | null;
  killSwitchActivated: boolean;
  killSwitchReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface PilotReviewRow {
  id: string;
  agentId: string | null;
  channel: string;
  subject: string | null;
  bodyText: string;
  verdict: 'ok' | 'off_brand' | 'off_topic' | 'non_compliant' | 'needs_edit';
  issues: string[] | null;
  reasoning: string | null;
  createdAt: string;
}

interface PilotRunDetail extends PilotRunRow {
  reviews: PilotReviewRow[];
}

export function PilotStage() {
  const stage = STAGE_BY_ID['pilot']!;
  const [runs, setRuns] = useState<PilotRunRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PilotRunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void api
      .get<PilotRunRow[]>('/pilot')
      .then((rows) => {
        setRuns(rows);
        if (!openId && rows[0]) setOpenId(rows[0].id);
      })
      .catch(() => setRuns([]));
  }, [refreshKey]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    void api
      .get<PilotRunDetail>(`/pilot/${openId}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [openId, refreshKey]);

  async function startRun() {
    setBusy(true);
    try {
      const r = await api.post<PilotRunRow>('/pilot', {});
      setOpenId(r.id);
      setRefreshKey((k) => k + 1);
      // Poll a few times so the user sees the run flip to ready_for_review.
      let n = 0;
      const interval = setInterval(() => {
        n++;
        setRefreshKey((k) => k + 1);
        if (n >= 6) clearInterval(interval);
      }, 3000);
    } finally {
      setBusy(false);
    }
  }

  async function approveOrBlock(id: string, goNoGo: 'go' | 'no_go') {
    await api.post(`/pilot/${id}/approve`, { goNoGo });
    setRefreshKey((k) => k + 1);
  }

  async function killRun(id: string) {
    const reason = prompt('Reason for killing this pilot?') ?? 'manual';
    await api.post(`/pilot/${id}/kill`, { reason });
    setRefreshKey((k) => k + 1);
  }

  return (
    <StepAssistant
      key={`pilot-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      headerActions={
        <button className="btn-primary" onClick={startRun} disabled={busy}>
          <Play size={14} /> {busy ? 'Starting…' : 'Run pilot'}
        </button>
      }
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              <ShieldCheck size={12} /> Pilot runs · {runs.length}
            </div>
            <div className="space-y-1.5">
              {runs.length === 0 && (
                <div className="text-xs text-slate-400">
                  Click <span className="font-medium">Run pilot</span> to generate sample messages
                  for every active agent and red-team-review each one.
                </div>
              )}
              {runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition ${
                    openId === r.id
                      ? 'border-brand-300 bg-brand-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                    <RunStatus status={r.status} />
                  </div>
                  {r.goNoGo && (
                    <div className="text-slate-500 mt-0.5">
                      Recommendation:{' '}
                      <span
                        className={
                          r.goNoGo === 'go'
                            ? 'text-emerald-700 font-medium'
                            : 'text-red-700 font-medium'
                        }
                      >
                        {r.goNoGo.toUpperCase()}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {detail && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Reviewed messages · {detail.reviews.length}
                </div>
                <div className="flex gap-1">
                  <button
                    className="btn-secondary text-xs"
                    onClick={() => approveOrBlock(detail.id, 'go')}
                    disabled={detail.status !== 'ready_for_review'}
                  >
                    <ThumbsUp size={12} /> Go
                  </button>
                  <button
                    className="btn-secondary text-xs text-red-600"
                    onClick={() => approveOrBlock(detail.id, 'no_go')}
                    disabled={detail.status !== 'ready_for_review'}
                  >
                    <ThumbsDown size={12} /> No-Go
                  </button>
                  <button
                    className="btn-secondary text-xs text-red-600"
                    onClick={() => killRun(detail.id)}
                    title="Hard kill — blocks the run regardless of verdicts"
                  >
                    <AlertOctagon size={12} />
                  </button>
                </div>
              </div>
              {detail.reasoning && (
                <div className="text-xs text-slate-700 bg-slate-50 rounded px-3 py-2 mb-3">
                  {detail.reasoning}
                </div>
              )}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {detail.reviews.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white border border-slate-200 rounded-lg p-3 text-xs"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <VerdictPill verdict={r.verdict} />
                      <span className="text-slate-500 capitalize">{r.channel}</span>
                    </div>
                    {r.subject && (
                      <div className="font-medium text-slate-900">{r.subject}</div>
                    )}
                    <div className="text-slate-700 whitespace-pre-wrap line-clamp-4">
                      {r.bodyText}
                    </div>
                    {r.reasoning && (
                      <div className="text-slate-500 mt-1.5 italic">{r.reasoning}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}

function RunStatus({ status }: { status: PilotRunRow['status'] }) {
  const styles: Record<PilotRunRow['status'], string> = {
    pending: 'bg-slate-100 text-slate-500',
    running: 'bg-amber-100 text-amber-700',
    ready_for_review: 'bg-blue-100 text-blue-700',
    approved: 'bg-emerald-100 text-emerald-700',
    blocked: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`badge ${styles[status]} capitalize`}>{status.replace(/_/g, ' ')}</span>
  );
}

function VerdictPill({ verdict }: { verdict: PilotReviewRow['verdict'] }) {
  const styles: Record<PilotReviewRow['verdict'], string> = {
    ok: 'bg-emerald-100 text-emerald-700',
    off_brand: 'bg-amber-100 text-amber-700',
    off_topic: 'bg-amber-100 text-amber-700',
    non_compliant: 'bg-red-100 text-red-700',
    needs_edit: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`badge ${styles[verdict]} capitalize`}>
      {verdict.replace(/_/g, ' ')}
    </span>
  );
}
