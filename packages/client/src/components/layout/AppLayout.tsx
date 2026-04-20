import { NavLink, Outlet, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  Users,
  Megaphone,
  Bot,
  Target,
  BarChart3,
  Settings,
  LogOut,
  Plug,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/opportunities', label: 'Pipeline', icon: Target },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/admin/integrations', label: 'Integrations', icon: Plug, roles: ['owner', 'admin'] as const },
];

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
        <div className="h-16 px-6 flex items-center border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold">
              C
            </div>
            <span className="font-semibold tracking-tight">CloserAI</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems
            .filter((item) => !('roles' in item) || (item.roles ?? []).includes(user?.role as never))
            .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
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
