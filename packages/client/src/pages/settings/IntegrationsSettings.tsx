import { useEffect, useState } from 'react';
import { Check, AlertCircle, Key, Eye, EyeOff, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/auth';

interface AnthropicStatus {
  isConfigured: boolean;
  keyPrefix: string | null;
  updatedAt: string | null;
}

export function IntegrationsSettings() {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'owner';

  const [status, setStatus] = useState<AnthropicStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const s = await api.get<AnthropicStatus>('/organizations/current/integrations/anthropic');
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  async function testConnection() {
    if (!apiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<{ ok: boolean; error?: string }>(
        '/organizations/current/integrations/anthropic/test',
        { apiKey },
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'failed' });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!apiKey) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.put<AnthropicStatus>(
        '/organizations/current/integrations/anthropic',
        { apiKey },
      );
      setStatus(result);
      setEditing(false);
      setApiKey('');
      setTestResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    if (!confirm('Remove the Anthropic API key? All AI features will stop working until you set a new one.')) {
      return;
    }
    try {
      await api.delete('/organizations/current/integrations/anthropic');
      setStatus({ isConfigured: false, keyPrefix: null, updatedAt: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear');
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-sm text-slate-500 mt-1">
          Credentials for third-party services. All secrets are encrypted at rest.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Key size={18} />
            </div>
            <div>
              <div className="font-medium">Anthropic API key</div>
              <div className="text-xs text-slate-500">
                Powers every AI feature: onboarding analysis, message generation, reply
                classification, deal health, ICP refinement
              </div>
            </div>
          </div>
          {status?.isConfigured ? (
            <span className="badge bg-emerald-100 text-emerald-700">
              <Check size={12} /> Configured
            </span>
          ) : (
            <span className="badge bg-amber-100 text-amber-700">
              <AlertCircle size={12} /> Not configured
            </span>
          )}
        </div>

        <div className="p-5">
          {status?.isConfigured && !editing && (
            <div className="space-y-3">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Key</dt>
                  <dd className="font-mono">
                    {status.keyPrefix}
                    <span className="text-slate-400">••••••••••••••••</span>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Last updated</dt>
                  <dd>
                    {status.updatedAt ? new Date(status.updatedAt).toLocaleString() : '—'}
                  </dd>
                </div>
              </dl>

              {isOwner ? (
                <div className="flex gap-2 pt-2">
                  <button className="btn-secondary" onClick={() => setEditing(true)}>
                    <RotateCcw size={14} />
                    Rotate key
                  </button>
                  <button
                    className="btn-ghost text-red-600 hover:bg-red-50"
                    onClick={clearKey}
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 pt-2">
                  Only organization owners can rotate this key.
                </p>
              )}
            </div>
          )}

          {(editing || !status?.isConfigured) && isOwner && (
            <div className="space-y-3">
              <div>
                <label className="label">API key</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      className="input font-mono pr-10"
                      type={showKey ? 'text' : 'password'}
                      placeholder="sk-ant-api03-..."
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setTestResult(null);
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Get a key from{' '}
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600"
                  >
                    console.anthropic.com
                  </a>
                  . Changes take effect immediately — no restart required.
                </p>
              </div>

              {testResult && (
                <div
                  className={`text-sm p-3 rounded-lg ${
                    testResult.ok
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {testResult.ok
                    ? 'Connection successful — this key works.'
                    : `Test failed: ${testResult.error}`}
                </div>
              )}

              {error && <div className="text-sm text-red-600">{error}</div>}

              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  onClick={testConnection}
                  disabled={!apiKey || testing}
                >
                  {testing ? 'Testing...' : 'Test connection'}
                </button>
                <button
                  className="btn-primary"
                  onClick={save}
                  disabled={!apiKey || saving}
                >
                  {saving ? 'Saving...' : 'Save key'}
                </button>
                {editing && (
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setEditing(false);
                      setApiKey('');
                      setTestResult(null);
                      setError(null);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {!status?.isConfigured && !isOwner && (
            <div className="text-sm text-slate-500">
              Ask an organization owner to configure the Anthropic API key.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
