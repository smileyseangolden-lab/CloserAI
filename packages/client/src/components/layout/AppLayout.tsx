import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { LayoutDashboard, LogOut, Plug, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { STAGES } from '../../workflow/stages';
import { api } from '../../api/client';

interface WorkspaceStage {
  stageId: string;
  status: 'locked' | 'in_progress' | 'approved';
  version: number;
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [stages, setStages] = useState<WorkspaceStage[]>([]);

  useEffect(() => {
    void api.get<WorkspaceStage[]>('/workspace').then(setStages).catch(() => setStages([]));

    const onFocus = () => void api.get<WorkspaceStage[]>('/workspace').then(setStages).catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const statusMap = new Map(stages.map((s) => [s.stageId, s.status]));
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

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
        <Outlet />
      </main>
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
