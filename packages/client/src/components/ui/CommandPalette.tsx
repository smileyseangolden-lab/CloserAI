import { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router';
import {
  BarChart3,
  Bot,
  FileClock,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Plug,
  Settings as SettingsIcon,
  Target,
  User2,
  Users,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { STAGES } from '@/workflow/stages';
import { api } from '@/api/client';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';

interface SearchResults {
  leads: Array<{ id: string; title: string; subtitle: string | null }>;
  campaigns: Array<{ id: string; title: string; subtitle: string | null }>;
  agents: Array<{ id: string; title: string; subtitle: string | null }>;
  contacts: Array<{
    id: string;
    leadId: string | null;
    title: string;
    subtitle: string | null;
  }>;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { toggle: toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const thisRequest = ++requestIdRef.current;
    debounceRef.current = window.setTimeout(() => {
      void api
        .get<SearchResults>(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => {
          if (thisRequest !== requestIdRef.current) return;
          setResults(r);
        })
        .catch(() => {
          if (thisRequest !== requestIdRef.current) return;
          setResults({ leads: [], campaigns: [], agents: [], contacts: [] });
        })
        .finally(() => {
          if (thisRequest === requestIdRef.current) setSearching(false);
        });
    }, 180);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

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
      { label: 'Audit log', icon: FileClock, path: '/admin/audit' },
    ],
    [],
  );

  const hasResults =
    results &&
    (results.leads.length > 0 ||
      results.campaigns.length > 0 ||
      results.agents.length > 0 ||
      results.contacts.length > 0);

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
            shouldFilter={false}
            className="flex h-full flex-col overflow-hidden rounded-xl"
          >
            <div className="relative border-b border-border-default">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search pages, stages, leads, campaigns, agents, contacts…"
                className="w-full bg-transparent px-4 py-3 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              {searching && (
                <Loader2
                  size={14}
                  className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-text-muted"
                  aria-label="Searching"
                />
              )}
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
                {query.trim().length < 2
                  ? 'Start typing to search, or pick a page below.'
                  : searching
                    ? 'Searching…'
                    : 'No results.'}
              </Command.Empty>

              {/* Pages + stages always available when there's no active query */}
              {query.trim().length < 2 && (
                <>
                  <Group heading="Go to">
                    {topLevel.map(({ label, icon: Icon, path }) => (
                      <Item
                        key={path}
                        onSelect={() => go(path)}
                        icon={<Icon className="h-4 w-4" />}
                      >
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
                        value={`stage-${stage.title}`}
                        onSelect={() => go(`/stages/${stage.id}`)}
                        icon={<stage.icon className="h-4 w-4" />}
                      >
                        <span className="font-medium">
                          {stage.order}. {stage.title}
                        </span>
                        <span className="ml-2 text-xs text-text-muted">
                          {stage.description}
                        </span>
                      </Item>
                    ))}
                  </Group>
                </>
              )}

              {results?.leads && results.leads.length > 0 && (
                <Group heading="Leads">
                  {results.leads.map((l) => (
                    <Item
                      key={l.id}
                      value={`lead-${l.id}`}
                      onSelect={() => go(`/leads/${l.id}`)}
                      icon={<Users className="h-4 w-4" />}
                    >
                      <span className="font-medium">{l.title}</span>
                      {l.subtitle && (
                        <span className="ml-2 text-xs text-text-muted truncate">
                          {l.subtitle}
                        </span>
                      )}
                    </Item>
                  ))}
                </Group>
              )}

              {results?.contacts && results.contacts.length > 0 && (
                <Group heading="Contacts">
                  {results.contacts.map((c) => (
                    <Item
                      key={c.id}
                      value={`contact-${c.id}`}
                      onSelect={() =>
                        c.leadId ? go(`/leads/${c.leadId}`) : onOpenChange(false)
                      }
                      icon={<User2 className="h-4 w-4" />}
                    >
                      <span className="font-medium">{c.title}</span>
                      {c.subtitle && (
                        <span className="ml-2 text-xs text-text-muted truncate">
                          {c.subtitle}
                        </span>
                      )}
                    </Item>
                  ))}
                </Group>
              )}

              {results?.campaigns && results.campaigns.length > 0 && (
                <Group heading="Campaigns">
                  {results.campaigns.map((c) => (
                    <Item
                      key={c.id}
                      value={`campaign-${c.id}`}
                      onSelect={() => go(`/campaigns/${c.id}`)}
                      icon={<Megaphone className="h-4 w-4" />}
                    >
                      <span className="font-medium">{c.title}</span>
                      {c.subtitle && (
                        <span className="ml-2 text-xs text-text-muted truncate">
                          {c.subtitle.replace(/_/g, ' ')}
                        </span>
                      )}
                    </Item>
                  ))}
                </Group>
              )}

              {results?.agents && results.agents.length > 0 && (
                <Group heading="Agents">
                  {results.agents.map((a) => (
                    <Item
                      key={a.id}
                      value={`agent-${a.id}`}
                      onSelect={() => go(`/agents/${a.id}`)}
                      icon={<Bot className="h-4 w-4" />}
                    >
                      <span className="font-medium">{a.title}</span>
                      {a.subtitle && (
                        <span className="ml-2 text-xs text-text-muted truncate">
                          {a.subtitle}
                        </span>
                      )}
                    </Item>
                  ))}
                </Group>
              )}

              {results && !hasResults && !searching && (
                <div className="px-3 py-4 text-center text-xs text-text-muted">
                  Nothing matches "{query}". Try a shorter term, or browse from the pages
                  above.
                </div>
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
      {icon ? (
        <span className="flex h-4 w-4 items-center justify-center text-text-muted">{icon}</span>
      ) : null}
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
