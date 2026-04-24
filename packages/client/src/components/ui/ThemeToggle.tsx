import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/cn';

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  const options: Array<{
    key: 'light' | 'dark' | 'system';
    icon: typeof Sun;
    label: string;
  }> = [
    { key: 'light', icon: Sun, label: 'Light' },
    { key: 'dark', icon: Moon, label: 'Dark' },
    { key: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        'inline-flex items-center rounded-lg border border-border-default bg-surface p-0.5',
        className,
      )}
    >
      {options.map(({ key, icon: Icon, label }) => {
        const active = preference === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setPreference(key)}
            aria-pressed={active}
            aria-label={label}
            className={cn(
              'flex h-6 w-7 items-center justify-center rounded-md transition',
              active
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-text-muted hover:bg-surface-muted hover:text-text-primary',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
