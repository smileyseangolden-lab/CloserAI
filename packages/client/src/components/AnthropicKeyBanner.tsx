import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, X } from 'lucide-react';
import { api } from '../api/client';

/**
 * Inline alert that prompts the user to configure their Anthropic API key
 * when it's missing. Silently hides itself once a key is configured.
 */
export function AnthropicKeyBanner() {
  const [needsKey, setNeedsKey] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void api
      .get<{ isConfigured: boolean }>('/organizations/current/integrations/anthropic')
      .then((s) => setNeedsKey(!s.isConfigured))
      .catch(() => setNeedsKey(false));
  }, []);

  if (!needsKey || dismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
      <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
      <div className="flex-1">
        <div className="font-medium text-amber-900">Anthropic API key not configured</div>
        <p className="text-sm text-amber-800 mt-0.5">
          AI features (message generation, reply analysis, deal health) will run in
          stub mode until you add a key.{' '}
          <Link to="/settings/integrations" className="font-medium underline">
            Configure in Settings → Integrations
          </Link>
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-600 hover:text-amber-800"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
