import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  LogOut,
  Plug,
  CheckCircle2,
  FileClock,
  Loader2,
  AlertOctagon,
  Play,
  Menu,
  Search,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { STAGES } from '../../workflow/stages';
import { api } from '../../api/client';
import {
  CommandPalette,
  ErrorBoundary,
  KeyboardShortcuts,
  PromptDialog,
  Sheet,
  SheetContent,
  SheetTitle,
  ThemeToggle,
  toast,
  useCommandPalette,
} from '../ui';

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const location = useLocation();

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

  const sidebar = (
    <SidebarContents
      user={user}
      statusMap={statusMap}
      isAdmin={isAdmin}
      canPause={canPause}
      pause={pause}
      onTogglePause={togglePause}
      onNavigate={() => setMobileNavOpen(false)}
      onLogout={() => {
        logout();
        navigate('/login');
      }}
    />
  );

  return (
    <div className="flex h-screen bg-app">
      <aside className="hidden lg:flex w-72 flex-shrink-0 bg-surface border-r border-border-default flex-col">
        {sidebar}
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">{sidebar}</div>
        </SheetContent>
      </Sheet>

      <main className="flex-1 overflow-auto min-w-0">
        <TopBar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        {pause?.paused && (
          <div className="bg-red-600 text-white px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
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
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <KeyboardShortcuts />

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

function TopBar({
  onOpenMobileNav,
  onOpenPalette,
}: {
  onOpenMobileNav: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 flex h-12 items-center justify-between gap-2 border-b border-border-default bg-surface/80 backdrop-blur px-3 md:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden flex items-center justify-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-muted hover:text-text-primary"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-2 rounded-lg border border-border-default bg-surface-muted/60 text-text-muted hover:text-text-primary px-3 py-1.5 text-sm min-w-[260px] transition"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="text-[10px] font-mono border border-border-default rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </button>
        <button
          onClick={onOpenPalette}
          className="sm:hidden flex items-center justify-center h-8 w-8 rounded-md text-text-muted hover:bg-surface-muted hover:text-text-primary"
          aria-label="Search"
        >
          <Search size={16} />
        </button>
      </div>
      <ThemeToggle />
    </div>
  );
}

function SidebarContents({
  user,
  statusMap,
  isAdmin,
  canPause,
  pause,
  onTogglePause,
  onNavigate,
  onLogout,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user'];
  statusMap: Map<string, WorkspaceStage['status']>;
  isAdmin: boolean;
  canPause: boolean;
  pause: PauseState | null;
  onTogglePause: () => void;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="h-16 px-6 flex items-center border-b border-border-default">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold">
            C
          </div>
          <span className="font-semibold tracking-tight text-text-primary">CloserAI</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <NavLink
          to="/dashboard"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition mb-3 ${
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
            }`
          }
        >
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>

        <WorkflowStepper statusMap={statusMap} onNavigate={onNavigate} />

        {isAdmin && (
          <>
            <div className="px-3 mt-5 text-[11px] font-semibold tracking-wider uppercase text-text-muted mb-2">
              Admin
            </div>
            <NavLink
              to="/admin/integrations"
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                }`
              }
            >
              <Plug size={18} />
              Integrations
            </NavLink>
            <NavLink
              to="/admin/audit"
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                }`
              }
            >
              <FileClock size={18} />
              Audit log
            </NavLink>
          </>
        )}
      </nav>

      {canPause && (
        <div className="px-3 pt-2 pb-2 border-t border-border-default">
          <button
            onClick={onTogglePause}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
              pause?.paused
                ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400'
                : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
            }`}
            title={pause?.paused ? 'Resume all outbound' : 'Pause all outbound (org-wide)'}
          >
            {pause?.paused ? <Play size={16} /> : <AlertOctagon size={16} />}
            {pause?.paused ? 'Resume outbound' : 'Pause all outbound'}
          </button>
        </div>
      )}

      <div className="p-3 border-t border-border-default">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-surface-muted text-text-primary flex items-center justify-center text-xs font-semibold">
            {user?.firstName?.[0] ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-text-primary">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-xs text-text-muted truncate">{user?.role}</div>
          </div>
          <button
            onClick={onLogout}
            className="text-text-muted hover:text-text-primary"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

function WorkflowStepper({
  statusMap,
  onNavigate,
}: {
  statusMap: Map<string, WorkspaceStage['status']>;
  onNavigate: () => void;
}) {
  const completed = STAGES.filter((s) => statusMap.get(s.id) === 'approved').length;
  const pct = Math.round((completed / STAGES.length) * 100);
  const nextIndex = STAGES.findIndex((s) => statusMap.get(s.id) !== 'approved');

  return (
    <div>
      <div className="px-3 mb-3">
        <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase text-text-muted">
          <span>Workflow</span>
          <span className="text-text-secondary normal-case tracking-normal font-medium">
            {completed}/{STAGES.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      <ol className="relative pl-3 pr-3">
        {STAGES.map((stage, i) => {
          const status = statusMap.get(stage.id) ?? 'locked';
          const prev = i > 0 ? statusMap.get(STAGES[i - 1]!.id) : undefined;
          const isNext = i === nextIndex && status !== 'approved';
          const isLast = i === STAGES.length - 1;
          const connectorTone = prev === 'approved' ? 'bg-emerald-400' : 'bg-border-default';
          return (
            <li key={stage.id} className="relative">
              <NavLink
                to={`/stages/${stage.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex items-start gap-3 rounded-lg pl-1 pr-2 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 font-medium dark:bg-brand-500/15 dark:text-brand-300'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary'
                  }`
                }
              >
                <div className="relative flex flex-col items-center pt-1">
                  <StageDot status={status} order={stage.order} isNext={isNext} />
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className={`w-px flex-1 min-h-[12px] mt-1 ${connectorTone}`}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-3">
                  <div className="flex items-center gap-2 truncate">
                    <span className="truncate">{stage.title}</span>
                    {isNext && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500 text-white font-semibold">
                        Next
                      </span>
                    )}
                  </div>
                  <StageChip status={status} />
                </div>
              </NavLink>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageDot({
  status,
  order,
  isNext,
}: {
  status: WorkspaceStage['status'];
  order: number;
  isNext: boolean;
}) {
  if (status === 'approved') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-emerald-500/10">
        <CheckCircle2 size={12} strokeWidth={3} />
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-4 ring-amber-500/10 dark:bg-amber-500/20 dark:text-amber-300">
        <Loader2 size={12} className="animate-spin" strokeWidth={3} />
      </span>
    );
  }
  if (isNext) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-brand-500 bg-surface text-brand-600 text-[10px] font-semibold ring-4 ring-brand-500/10 dark:text-brand-300">
        {order}
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border-default bg-surface text-text-muted text-[10px] font-semibold">
      {order}
    </span>
  );
}

function StageChip({ status }: { status: WorkspaceStage['status'] }) {
  const map: Record<
    WorkspaceStage['status'],
    { label: string; classes: string }
  > = {
    approved: {
      label: 'Approved',
      classes:
        'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    in_progress: {
      label: 'In progress',
      classes: 'text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300',
    },
    locked: {
      label: 'Not started',
      classes: 'text-text-muted bg-surface-muted',
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cfg.classes}`}
    >
      {cfg.label}
    </span>
  );
}
