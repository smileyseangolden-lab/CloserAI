import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      )}
    >
      {Icon ? (
        <div
          className={cn(
            'mb-4 flex items-center justify-center rounded-full bg-brand-50 text-brand-500 ring-8 ring-brand-50/40',
            'dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/10',
            compact ? 'h-10 w-10' : 'h-14 w-14',
          )}
        >
          <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
        </div>
      ) : null}
      <h3
        className={cn('font-semibold text-text-primary', compact ? 'text-sm' : 'text-base')}
      >
        {title}
      </h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
