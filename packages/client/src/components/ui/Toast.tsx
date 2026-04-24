import { Toaster as SonnerToaster, toast } from 'sonner';
import { useTheme } from '@/lib/theme';

export { toast };

export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      richColors
      theme={theme}
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg border border-border-default bg-surface-elevated shadow-lg text-sm text-text-primary',
          title: 'font-medium text-text-primary',
          description: 'text-text-muted',
        },
      }}
    />
  );
}
