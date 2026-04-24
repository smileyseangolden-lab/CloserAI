import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex flex-col gap-3 mb-6 md:mb-8 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
