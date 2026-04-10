import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  change?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'positive' | 'negative';
}

export function StatCard({ label, value, change, icon: Icon, tone = 'neutral' }: Props) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
          <div className="text-3xl font-semibold mt-2">{value}</div>
          {change && (
            <div
              className={`text-xs mt-2 ${
                tone === 'positive'
                  ? 'text-emerald-600'
                  : tone === 'negative'
                    ? 'text-red-600'
                    : 'text-slate-500'
              }`}
            >
              {change}
            </div>
          )}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
