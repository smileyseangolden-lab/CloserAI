import { forwardRef, type HTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Field({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('space-y-1.5', className)}>{children}</div>;
}

export const FieldLabel = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, children, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'block text-xs font-medium uppercase tracking-wide text-text-muted',
      className,
    )}
    {...props}
  >
    {children}
  </label>
));
FieldLabel.displayName = 'FieldLabel';

export function FieldHint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs text-text-muted', className)}>{children}</p>;
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-xs text-red-600 dark:text-red-400" role="alert">
      {children}
    </p>
  );
}

export function FormError({ children, className }: { children?: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700',
        'dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormRow(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', props.className)} />;
}
