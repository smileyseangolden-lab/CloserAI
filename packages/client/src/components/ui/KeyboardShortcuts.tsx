import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './Dialog';

interface Shortcut {
  keys: string[];
  label: string;
  group: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'K'], label: 'Open command palette', group: 'General' },
  { keys: ['?'], label: 'Show keyboard shortcuts', group: 'General' },
  { keys: ['Esc'], label: 'Close any dialog or menu', group: 'General' },
  { keys: ['g', 'd'], label: 'Go to Dashboard', group: 'Navigation' },
  { keys: ['g', 'l'], label: 'Go to Leads', group: 'Navigation' },
  { keys: ['g', 'c'], label: 'Go to Campaigns', group: 'Navigation' },
  { keys: ['g', 'a'], label: 'Go to Agents', group: 'Navigation' },
  { keys: ['g', 'p'], label: 'Go to Pipeline', group: 'Navigation' },
  { keys: ['g', 'n'], label: 'Go to Analytics', group: 'Navigation' },
  { keys: ['g', 's'], label: 'Go to Settings', group: 'Navigation' },
  { keys: ['m'], label: 'Focus message input (in a stage)', group: 'Assistant' },
  { keys: ['⌘', '↵'], label: 'Send message', group: 'Assistant' },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let gPressed = false;
    let gTimer: number | null = null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if (gPressed) gPressed = false;
        return;
      }

      // ? opens help regardless of where (common convention), unless typing.
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (gPressed) {
        const dest = navTarget(e.key.toLowerCase());
        if (dest) {
          e.preventDefault();
          navigate(dest);
        }
        gPressed = false;
        if (gTimer) {
          window.clearTimeout(gTimer);
          gTimer = null;
        }
        return;
      }

      if (e.key === 'g') {
        gPressed = true;
        if (gTimer) window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => {
          gPressed = false;
        }, 1200);
        return;
      }

      if (e.key === 'm') {
        // Focus the message input of the current stage assistant, if any.
        const el = document.querySelector<HTMLTextAreaElement>(
          '[data-assistant-input="true"]',
        );
        if (el) {
          e.preventDefault();
          el.focus();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (gTimer) window.clearTimeout(gTimer);
    };
  }, [navigate]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="w-[min(92vw,34rem)]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> any time to open this again.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {groupByKey(SHORTCUTS, 'group').map(([group, items]) => (
              <section key={group}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {group}
                </div>
                <ul className="space-y-1.5">
                  {items.map((s, i) => (
                    <li
                      key={`${group}-${i}`}
                      className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted/60"
                    >
                      <span className="text-text-primary">{s.label}</span>
                      <span className="flex items-center gap-1">
                        {s.keys.map((k, j) => (
                          <Kbd key={j}>{k}</Kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function navTarget(key: string): string | null {
  switch (key) {
    case 'd':
      return '/dashboard';
    case 'l':
      return '/leads';
    case 'c':
      return '/campaigns';
    case 'a':
      return '/agents';
    case 'p':
      return '/opportunities';
    case 'n':
      return '/analytics';
    case 's':
      return '/settings';
    default:
      return null;
  }
}

function groupByKey<T, K extends keyof T>(
  items: T[],
  key: K,
): Array<[T[K], T[]]> {
  const map = new Map<T[K], T[]>();
  for (const item of items) {
    const k = item[key];
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return Array.from(map.entries());
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="min-w-[1.5rem] text-center rounded border border-border-default bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
      {children}
    </kbd>
  );
}
