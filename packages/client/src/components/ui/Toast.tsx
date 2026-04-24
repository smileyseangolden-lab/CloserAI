import { Toaster as SonnerToaster, toast } from 'sonner';

export { toast };

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            'rounded-lg border border-slate-200 bg-white shadow-lg text-sm text-slate-700',
          title: 'font-medium text-slate-900',
          description: 'text-slate-500',
        },
      }}
    />
  );
}
