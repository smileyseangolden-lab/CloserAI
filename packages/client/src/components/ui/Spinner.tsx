import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Spinner({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5';
  return <Loader2 className={cn('animate-spin text-brand-500', sizeClass, className)} />;
}

export function LoadingBlock({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-10 text-sm text-slate-500',
        className,
      )}
    >
      <Spinner size="md" />
      <span>{label}</span>
    </div>
  );
}
