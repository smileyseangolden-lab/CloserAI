import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TimelineItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  timestamp: string | Date;
  icon?: LucideIcon;
  tone?: 'neutral' | 'brand' | 'positive' | 'warning' | 'critical';
  meta?: ReactNode;
}

const toneStyles: Record<NonNullable<TimelineItem['tone']>, string> = {
  neutral: 'bg-surface-muted text-text-muted',
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  positive:
    'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  critical: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
};

function formatTimestamp(v: string | Date) {
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function Timeline({
  items,
  className,
}: {
  items: TimelineItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => {
        const Icon = item.icon;
        const tone = item.tone ?? 'neutral';
        const isLast = i === items.length - 1;
        return (
          <li key={item.id} className="relative pl-10 pb-5 last:pb-0">
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-3.5 top-7 bottom-0 w-px bg-border-default"
              />
            )}
            <span
              className={cn(
                'absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-surface',
                toneStyles[tone],
              )}
            >
              {Icon ? <Icon size={14} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-text-primary">{item.title}</div>
                <time
                  dateTime={new Date(item.timestamp).toISOString()}
                  title={new Date(item.timestamp).toLocaleString()}
                  className="text-xs text-text-muted whitespace-nowrap tabular-nums"
                >
                  {formatTimestamp(item.timestamp)}
                </time>
              </div>
              {item.description && (
                <div className="text-sm text-text-secondary">{item.description}</div>
              )}
              {item.meta && <div className="text-xs text-text-muted">{item.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
