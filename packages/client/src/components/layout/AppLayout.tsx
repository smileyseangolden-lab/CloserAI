import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { LayoutDashboard, LogOut, Plug, CheckCircle2, Circle, Loader2, AlertOctagon, Play } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { STAGES } from '../../workflow/stages';
import { api } from '../../api/client';
import { PromptDialog, toast } from '../ui';

interface WorkspaceStage {
  stageId: string;
  status: 'locked' | 'in_progress' | 'approved';
  version: number;
}

interface PauseState {
  paused: boolean;
  pausedAt: string | null;
  pauseReason: string | null;
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [stages, setStages] = useState<WorkspaceStage[]>([]);
  const [pause, setPause] = useState<PauseState | null>(null);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseSubmitting, setPauseSubmitting] = useState(false);

  useEffect(() => {
    void api.get<WorkspaceStage[]>('/workspace').then(setStages).catch(() => setStages([]));
    void api
      .get<PauseState>('/organizations/current/pause-outbound')
      .then(setPause)
      .catch(() => setPause(null));

    const onFocus = () => {
      void api.get<WorkspaceStage[]>('/workspace').then(setStages).catch(() => {});
      void api
        .get<PauseState>('/organizations/current/pause-outbound')
        .then(setPause)
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  async function submitPause(reason: string | undefined, nextPaused: boolean) {
    setPauseSubmitting(true);
    try {
      const r = await api.patch<PauseState>('/organizations/current/pause-outbound', {
        paused: nextPaused,
        reason,
      });
      setPause(r);
      toast.success(nextPaused ? 'Outbound paused' : 'Outbound resumed');
      setPauseDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update pause state');
    } finally {
      setPauseSubmitting(false);
    }
  }

  async function togglePause() {
    const nextPaused = !(pause?.paused ?? false);
    if (nextPaused) {
      setPauseDialogOpen(true);
      return;
    }
    await submitPause(undefined, false);
  }

  const statusMap = new Map(stages.map((s) => [s.stageId, s.status]));
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const canPause = isAdmin || user?.role === 'manager';

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col">
        <div className="h-16 px-6 flex items-center border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold">
              C
            </div>
            <span className="font-semibold tracking-tight">CloserAI</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition mb-3 ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <LayoutDashboard size={18} />
            Dashboard
          </NavLink>

          <div className="px-3 text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-2">
            Workflow
          </div>

          <ol className="space-y-0.5">
            {STAGES.map((stage, i) => {
              const status = statusMap.get(stage.id) ?? 'locked';
              const isLastApproved =
                status !== 'approved' &&
                i > 0 &&
                statusMap.get(STAGES[i - 1]!.id) === 'approved';
              return (
                <li key={stage.id}>
                  <NavLink
                    to={`/stages/${stage.id}`}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    <StageIndicator status={status} order={stage.order} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate flex items-center gap-2">
                        {stage.title}
                        {isLastApproved && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500 text-white font-semibold">
                            Next
                          </span>
                        )}
                      </div>
                    </div>
                  </NavLink>
                </li>
              );
            })}
          </ol>

          {isAdmin && (
            <>
              <div className="px-3 mt-5 text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-2">
                Admin
              </div>
              <NavLink
                to="/admin/integrations"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Plug size={18} />
                Integrations
              </NavLink>
            </>
          )}
        </nav>

        {canPause && (
          <div className="px-3 pt-2 pb-2 border-t border-slate-200">
            <button
              onClick={togglePause}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                pause?.paused
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              title={pause?.paused ? 'Resume all outbound' : 'Pause all outbound (org-wide)'}
            >
              {pause?.paused ? <Play size={16} /> : <AlertOctagon size={16} />}
              {pause?.paused ? 'Resume outbound' : 'Pause all outbound'}
            </button>
          </div>
        )}

        <div className="p-3 border-t border-slate-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold">
              {user?.firstName?.[0] ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-xs text-slate-500 truncate">{user?.role}</div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {pause?.paused && (
          <div className="bg-red-600 text-white px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <AlertOctagon size={16} />
              <span className="font-semibold">All outbound is paused.</span>
              {pause.pauseReason && <span className="opacity-90">— {pause.pauseReason}</span>}
              {pause.pausedAt && (
                <span className="opacity-75 text-xs">
                  since {new Date(pause.pausedAt).toLocaleString()}
                </span>
              )}
            </div>
            {canPause && (
              <button
                onClick={togglePause}
                className="text-xs px-3 py-1 rounded-full bg-white text-red-700 font-semibold hover:bg-red-50"
              >
                Resume
              </button>
            )}
          </div>
        )}
        <Outlet />
      </main>

      <PromptDialog
        open={pauseDialogOpen}
        onOpenChange={setPauseDialogOpen}
        title="Pause all outbound"
        description="This halts every outbound message org-wide until you resume. Leave a reason for your teammates."
        label="Reason (optional)"
        placeholder="e.g. holiday freeze, investigating deliverability…"
        confirmLabel="Pause outbound"
        destructive
        loading={pauseSubmitting}
        onConfirm={(value) => submitPause(value.trim() || undefined, true)}
      />
    </div>
  );
}

function StageIndicator({
  status,
  order,
}: {
  status: 'locked' | 'in_progress' | 'approved';
  order: number;
}) {
  if (status === 'approved') {
    return <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />;
  }
  if (status === 'in_progress') {
    return <Loader2 size={18} className="text-amber-500 flex-shrink-0" />;
  }
  return (
    <div className="w-[18px] h-[18px] flex-shrink-0 rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500 flex items-center justify-center">
      {order}
    </div>
  );
}
