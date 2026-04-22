import { useEffect, useState } from 'react';
import { api } from '../../api/client';

/**
 * The OAuth popup lands here. It posts the code + state to the server, which
 * exchanges for tokens and upserts a crm_connections row, then notifies the
 * opener (the Deployment page) and closes itself.
 */
export function CrmCallbackPage() {
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Finishing OAuth…');

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const err = url.searchParams.get('error');

    if (err) {
      setStatus('error');
      setMessage(err);
      return;
    }
    if (!code || !state) {
      setStatus('error');
      setMessage('Missing code or state');
      return;
    }

    void (async () => {
      try {
        await api.post('/crm/callback', { code, state });
        setStatus('ok');
        setMessage('Connected! You can close this window.');
        try {
          window.opener?.postMessage({ type: 'crm-oauth-complete' }, window.location.origin);
        } catch {
          // ignore cross-origin
        }
        setTimeout(() => window.close(), 1500);
      } catch (e) {
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'OAuth callback failed');
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="text-lg font-semibold text-slate-900 mb-2">
          {status === 'working' && 'Connecting…'}
          {status === 'ok' && 'Connected'}
          {status === 'error' && 'Something went wrong'}
        </div>
        <div
          className={`text-sm ${
            status === 'error' ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {message}
        </div>
      </div>
    </div>
  );
}
