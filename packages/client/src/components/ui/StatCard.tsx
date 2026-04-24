import type { LucideIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/cn';

interface Props {
  label: string;
  value: string | number;
  change?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'positive' | 'negative';
  sparkline?: number[];
  sparklineTone?: 'brand' | 'positive' | 'negative' | 'neutral';
  compact?: boolean;
  className?: string;
}

const sparklineColors: Record<NonNullable<Props['sparklineTone']>, string> = {
  brand: '#3355f0',
  positive: '#10b981',
  negative: '#ef4444',
  neutral: '#94a3b8',
};

export function StatCard({
  label,
  value,
  change,
  icon: Icon,
  tone = 'neutral',
  sparkline,
  sparklineTone = 'brand',
  compact = false,
  className,
}: Props) {
  const chartData = sparkline?.map((v, i) => ({ i, v })) ?? null;
  const color = sparklineColors[sparklineTone];
  const gradientId = `sparkline-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className={cn('card p-4 md:p-5 overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-text-muted font-medium truncate">
            {label}
          </div>
          <div
            className={cn(
              'font-semibold mt-1.5 text-text-primary tabular-nums',
              compact ? 'text-2xl' : 'text-3xl',
            )}
          >
            {value}
          </div>
          {change && (
            <div
              className={cn(
                'text-xs mt-1.5',
                tone === 'positive'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : tone === 'negative'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-text-muted',
              )}
            >
              {change}
            </div>
          )}
        </div>
        {Icon && (
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center dark:bg-brand-500/15 dark:text-brand-300">
            <Icon size={18} />
          </div>
        )}
      </div>
      {chartData && chartData.length > 1 && (
        <div className="mt-3 -mx-4 md:-mx-5 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
