import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, RotateCcw, Save, TestTube2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { ConfirmDialog, LoadingBlock, toast } from '../components/ui';
import { api } from '../api/client';

interface ProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'number' | 'boolean' | 'url';
  secret?: boolean;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  envFallback?: string;
  default?: string | number | boolean;
}

interface ProviderDefinition {
  key: string;
  name: string;
  category: 'ai' | 'enrichment' | 'linkedin' | 'email' | 'general';
  vendor?: string;
  docsUrl?: string;
  description: string;
  fields: ProviderField[];
  testable?: boolean;
}

interface ProviderSettings {
  providerKey: string;
  values: Record<string, unknown>;
  source: Record<string, 'org' | 'env' | 'default' | 'missing'>;
  hasOrgOverride: boolean;
  updatedAt?: string;
}

const CATEGORY_LABELS: Record<ProviderDefinition['category'], string> = {
  ai: 'AI & Embeddings',
  enrichment: 'Lead enrichment',
  linkedin: 'LinkedIn',
  email: 'Email',
  general: 'General',
};

const CATEGORY_ORDER: ProviderDefinition['category'][] = [
  'ai',
  'enrichment',
  'linkedin',
  'email',
  'general',
];

export function IntegrationsPage() {
  const [catalog, setCatalog] = useState<ProviderDefinition[] | null>(null);
  const [settings, setSettings] = useState<Record<string, ProviderSettings> | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<ProviderDefinition[]>('/admin/providers/catalog'),
      api.get<ProviderSettings[]>('/admin/providers'),
    ])
      .then(([cat, list]) => {
        setCatalog(cat);
        setSettings(Object.fromEntries(list.map((s) => [s.providerKey, s])));
        if (cat[0]) setActiveKey(cat[0].key);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  const grouped = useMemo(() => {
    if (!catalog) return null;
    const out: Record<string, ProviderDefinition[]> = {};
    for (const def of catalog) {
      out[def.category] = out[def.category] ?? [];
      out[def.category]!.push(def);
    }
    return out;
  }, [catalog]);

  const activeDef = catalog?.find((d) => d.key === activeKey) ?? null;
  const activeSettings = activeKey && settings ? settings[activeKey] : null;

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Integrations"
        subtitle="API keys and configuration for every external service. Saved values override environment defaults."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!catalog || !settings || !grouped ? (
        <LoadingBlock label="Loading integrations…" />
      ) : (
        <div className="flex gap-6">
          <nav className="w-56 flex-shrink-0 space-y-6">
            {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((cat) => (
              <div key={cat}>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2 px-3">
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="space-y-1">
                  {grouped[cat]!.map((def) => {
                    const s = settings[def.key];
                    return (
                      <button
                        key={def.key}
                        onClick={() => setActiveKey(def.key)}
                        className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                          activeKey === def.key
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{def.name}</span>
                        {s?.hasOrgOverride && (
                          <span className="badge bg-emerald-50 text-emerald-700">on</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="flex-1 min-w-0">
            {activeDef && activeSettings && (
              <ProviderCard
                key={activeDef.key}
                definition={activeDef}
                settings={activeSettings}
                onSaved={(updated) =>
                  setSettings((prev) => ({ ...(prev ?? {}), [updated.providerKey]: updated }))
                }
                onReset={() => setResetConfirmOpen(true)}
              />
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={(open) => !resetBusy && setResetConfirmOpen(open)}
        title={activeDef ? `Reset ${activeDef.name} settings?` : 'Reset settings?'}
        description="This removes all org-level settings for this provider. Environment defaults will apply instead."
        confirmLabel="Reset"
        destructive
        loading={resetBusy}
        onConfirm={async () => {
          if (!activeDef) return;
          setResetBusy(true);
          try {
            await api.delete(`/admin/providers/${activeDef.key}`);
            const refreshed = await api.get<ProviderSettings[]>('/admin/providers');
            setSettings(Object.fromEntries(refreshed.map((s) => [s.providerKey, s])));
            toast.success(`${activeDef.name} reset to defaults`);
            setResetConfirmOpen(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Reset failed');
          } finally {
            setResetBusy(false);
          }
        }}
      />
    </div>
  );
}

interface ProviderCardProps {
  definition: ProviderDefinition;
  settings: ProviderSettings;
  onSaved: (s: ProviderSettings) => void;
  onReset: () => void;
}

function ProviderCard({ definition, settings, onSaved, onReset }: ProviderCardProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...settings.values }));
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Reset draft when switching providers (key change handled by component remount).
  useEffect(() => {
    setDraft({ ...settings.values });
    setRevealed({});
    setTestResult(null);
    setSavedAt(null);
  }, [settings.providerKey, settings.updatedAt]);

  const onChange = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      // Strip masked values so we don't ship "•••• abcd" back to the server.
      const payload: Record<string, unknown> = {};
      for (const field of definition.fields) {
        const v = draft[field.key];
        if (typeof v === 'string' && v.startsWith('••••')) continue;
        payload[field.key] = v;
      }
      const updated = await api.put<ProviderSettings>(`/admin/providers/${definition.key}`, {
        payload,
      });
      onSaved(updated);
      setSavedAt(Date.now());
      toast.success(`${definition.name} settings saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api
        .post<{ ok: boolean; message: string }>(`/admin/providers/${definition.key}/test`)
        .catch((err: Error) => ({ ok: false, message: err.message }));
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{definition.name}</h2>
          {definition.vendor && (
            <div className="text-xs text-slate-500">{definition.vendor}</div>
          )}
        </div>
        <div className="flex gap-2">
          {definition.docsUrl && (
            <a
              className="btn-ghost"
              href={definition.docsUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Docs
            </a>
          )}
          {settings.hasOrgOverride && (
            <button className="btn-ghost text-red-600 hover:bg-red-50" onClick={onReset}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-600 mb-6">{definition.description}</p>

      <div className="space-y-5">
        {definition.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={draft[field.key]}
            source={settings.source[field.key]}
            revealed={!!revealed[field.key]}
            onToggleReveal={() =>
              setRevealed((r) => ({ ...r, [field.key]: !r[field.key] }))
            }
            onChange={(v) => onChange(field.key, v)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2 border-t border-slate-200 pt-4">
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
        {definition.testable && (
          <button className="btn-secondary" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <TestTube2 size={14} />}
            Test connection
          </button>
        )}
        {savedAt && (
          <span className="text-xs text-emerald-600">Saved</span>
        )}
        {testResult && (
          <span
            className={`text-xs ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

interface FieldRowProps {
  field: ProviderField;
  value: unknown;
  source?: 'org' | 'env' | 'default' | 'missing';
  revealed: boolean;
  onToggleReveal: () => void;
  onChange: (v: unknown) => void;
}

function FieldRow({ field, value, source, revealed, onToggleReveal, onChange }: FieldRowProps) {
  const sourceLabel: Record<NonNullable<FieldRowProps['source']>, { text: string; cls: string }> = {
    org: { text: 'org override', cls: 'bg-brand-50 text-brand-700' },
    env: { text: 'from env', cls: 'bg-amber-50 text-amber-700' },
    default: { text: 'default', cls: 'bg-slate-100 text-slate-600' },
    missing: { text: 'unset', cls: 'bg-red-50 text-red-700' },
  };
  const badge = source ? sourceLabel[source] : null;
  const stringValue = value == null ? '' : String(value);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="label mb-0">{field.label}</label>
        {field.required && <span className="text-xs text-red-500">required</span>}
        {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
        {field.envFallback && (
          <span className="text-[10px] text-slate-400 font-mono">{field.envFallback}</span>
        )}
      </div>
      {field.description && (
        <p className="text-xs text-slate-500 mb-1.5">{field.description}</p>
      )}

      {field.type === 'select' ? (
        <select
          className="input"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === 'boolean' ? (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
          checked={value === true || value === 'true'}
          onChange={(e) => onChange(e.target.checked)}
        />
      ) : field.type === 'password' ? (
        <div className="relative">
          <input
            className="input pr-10 font-mono text-xs"
            type={revealed ? 'text' : 'password'}
            placeholder={field.placeholder ?? 'Enter API key'}
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onToggleReveal}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={revealed ? 'Hide' : 'Show'}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      ) : (
        <input
          className="input"
          type={field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder ?? ''}
          value={stringValue}
          onChange={(e) =>
            onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
          }
        />
      )}
    </div>
  );
}
