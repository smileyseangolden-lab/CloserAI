import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router';
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  Megaphone,
  Plug,
  Settings as SettingsIcon,
  Target,
  Users,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { STAGES } from '@/workflow/stages';
import { api } from '@/api/client';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';

interface LeadHit {
  id: string;
  companyName: string;
}
interface CampaignHit {
  id: string;
  name: string;
}
interface AgentHit {
  id: string;
  name: string;
  senderName: string | null;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { toggle: toggleTheme } = useTheme();
  const [leads, setLeads] = useState<LeadHit[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignHit[] | null>(null);
  const [agents, setAgents] = useState<AgentHit[] | null>(null);

  useEffect(() => {
    if (!open) return;
    if (leads === null) {
      void api
        .get<{ data: LeadHit[] }>('/leads?limit=50')
        .then((r) => setLeads(r.data))
        .catch(() => setLeads([]));
    }
    if (campaigns === null) {
      void api
        .get<CampaignHit[]>('/campaigns')
        .then(setCampaigns)
        .catch(() => setCampaigns([]));
    }
    if (agents === null) {
      void api
        .get<AgentHit[]>('/agents')
        .then(setAgents)
        .catch(() => setAgents([]));
    }
  }, [open, leads, campaigns, agents]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const topLevel = useMemo(
    () => [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'Leads', icon: Users, path: '/leads' },
      { label: 'Campaigns', icon: Megaphone, path: '/campaigns' },
      { label: 'Agents', icon: Bot, path: '/agents' },
      { label: 'Pipeline', icon: Target, path: '/opportunities' },
      { label: 'Analytics', icon: BarChart3, path: '/analytics' },
      { label: 'Settings', icon: SettingsIcon, path: '/settings' },
      { label: 'Integrations', icon: Plug, path: '/admin/integrations' },
    ],
    [],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-[18%] z-50 w-[min(92vw,36rem)] -translate-x-1/2',
            'rounded-xl border border-border-default bg-surface-elevated shadow-2xl focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command
            label="Command menu"
            className="flex h-full flex-col overflow-hidden rounded-xl"
          >
            <Command.Input
              placeholder="Search pages, stages, leads, campaigns, agents…"
              className="w-full border-b border-border-default bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
                No results.
              </Command.Empty>

              <Group heading="Go to">
                {topLevel.map(({ label, icon: Icon, path }) => (
                  <Item key={path} onSelect={() => go(path)} icon={<Icon className="h-4 w-4" />}>
                    {label}
                  </Item>
                ))}
                <Item
                  onSelect={() => {
                    onOpenChange(false);
                    toggleTheme();
                  }}
                  icon={<SettingsIcon className="h-4 w-4" />}
                >
                  Toggle dark mode
                </Item>
              </Group>

              <Group heading="Workflow stages">
                {STAGES.map((stage) => (
                  <Item
                    key={stage.id}
                    value={`stage-${stage.title}-${stage.description}`}
                    onSelect={() => go(`/stages/${stage.id}`)}
                    icon={<stage.icon className="h-4 w-4" />}
                  >
                    <span className="font-medium">
                      {stage.order}. {stage.title}
                    </span>
                    <span className="ml-2 text-xs text-text-muted">{stage.description}</span>
                  </Item>
                ))}
              </Group>

              {leads && leads.length > 0 && (
                <Group heading="Leads">
                  {leads.slice(0, 10).map((l) => (
                    <Item
                      key={l.id}
                      value={`lead-${l.companyName}`}
                      onSelect={() => go(`/leads/${l.id}`)}
                      icon={<Users className="h-4 w-4" />}
                    >
                      {l.companyName}
                    </Item>
                  ))}
                </Group>
              )}

              {campaigns && campaigns.length > 0 && (
                <Group heading="Campaigns">
                  {campaigns.slice(0, 10).map((c) => (
                    <Item
                      key={c.id}
                      value={`campaign-${c.name}`}
                      onSelect={() => go(`/campaigns/${c.id}`)}
                      icon={<Megaphone className="h-4 w-4" />}
                    >
                      {c.name}
                    </Item>
                  ))}
                </Group>
              )}

              {agents && agents.length > 0 && (
                <Group heading="Agents">
                  {agents.slice(0, 10).map((a) => (
                    <Item
                      key={a.id}
                      value={`agent-${a.name}-${a.senderName ?? ''}`}
                      onSelect={() => go(`/agents/${a.id}`)}
                      icon={<Bot className="h-4 w-4" />}
                    >
                      <span className="font-medium">{a.name}</span>
                      {a.senderName && (
                        <span className="ml-2 text-xs text-text-muted">{a.senderName}</span>
                      )}
                    </Item>
                  ))}
                </Group>
              )}
            </Command.List>
            <div className="flex items-center justify-between border-t border-border-default bg-surface-muted px-3 py-2 text-[11px] text-text-muted">
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate · <Kbd>↵</Kbd> to open
              </span>
              <span>
                <Kbd>Esc</Kbd> to close
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-text-muted"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  children,
  onSelect,
  icon,
  value,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  icon?: React.ReactNode;
  value?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      value={value}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-text-primary',
        'data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700',
        'dark:data-[selected=true]:bg-brand-500/15 dark:data-[selected=true]:text-brand-300',
      )}
    >
      {icon ? <span className="flex h-4 w-4 items-center justify-center text-text-muted">{icon}</span> : null}
      <div className="flex flex-1 items-baseline gap-1 overflow-hidden">{children}</div>
    </Command.Item>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border-default bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
      {children}
    </kbd>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isPaletteKey =
        (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      if (isPaletteKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}
