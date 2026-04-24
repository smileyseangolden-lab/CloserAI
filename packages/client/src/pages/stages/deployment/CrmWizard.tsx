import { useEffect, useMemo, useState } from 'react';
import { Plug, Check, AlertTriangle, ArrowRight, Unplug } from 'lucide-react';
import { api } from '../../../api/client';
import { ConfirmDialog, toast } from '../../../components/ui';

type ProviderKey = 'hubspot' | 'salesforce' | 'pipedrive';

interface ProviderInfo {
  key: ProviderKey;
  name: string;
  docsUrl: string;
  scopes: string[];
  entities: string[];
}

interface Connection {
  id: string;
  provider: ProviderKey;
  status: 'pending' | 'connected' | 'error' | 'disconnected';
  accountName: string | null;
  accountId: string | null;
  hasTokens: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

interface LocalField {
  key: string;
  label: string;
  source: string;
}
interface FieldsResponse {
  local: Record<'lead' | 'contact' | 'opportunity', LocalField[]>;
  remote: Record<'lead' | 'contact' | 'opportunity', string[]>;
}

interface Mapping {
  id?: string;
  entity: 'lead' | 'contact' | 'opportunity';
  localField: string;
  remoteField: string;
  direction: 'push' | 'pull' | 'both';
}

const ENTITY_TABS: Array<'lead' | 'contact' | 'opportunity'> = [
  'lead',
  'contact',
  'opportunity',
];

export function CrmWizard() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [openConnId, setOpenConnId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);

  useEffect(() => {
    void api.get<ProviderInfo[]>('/crm/providers').then(setProviders).catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    void api.get<Connection[]>('/crm/connections').then(setConnections).catch(() => setConnections([]));

    // Poll once when a child OAuth window finishes.
    function onMessage(e: MessageEvent) {
      if (e?.data?.type === 'crm-oauth-complete') {
        setRefreshKey((k) => k + 1);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshKey]);

  async function connect(provider: ProviderKey) {
    const redirectUri = `${window.location.origin}/oauth/crm-callback`;
    try {
      const r = await api.post<{ authorizeUrl: string }>('/crm/connect', {
        provider,
        redirectUri,
      });
      // Open a popup to perform the consent flow.
      const w = window.open(r.authorizeUrl, 'crm_oauth', 'width=600,height=720');
      if (!w) {
        toast.error('Please allow popups and try again.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start OAuth');
    }
  }

  async function submitDisconnect() {
    if (!disconnectTarget) return;
    setDisconnectBusy(true);
    try {
      await api.post(`/crm/connections/${disconnectTarget}/disconnect`, {});
      toast.success('CRM disconnected');
      setDisconnectTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setDisconnectBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-default p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
        <Plug size={12} /> CRM wizard
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {providers.map((p) => {
          const conn = connections.find((c) => c.provider === p.key);
          return (
            <div
              key={p.key}
              className={`rounded-lg border p-3 text-sm ${
                conn?.status === 'connected'
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : conn?.status === 'error'
                    ? 'border-red-200 bg-red-50/40'
                    : 'border-border-default bg-surface'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="font-medium text-text-primary">{p.name}</div>
                {conn?.status === 'connected' ? (
                  <span className="badge bg-emerald-100 text-emerald-700">
                    <Check size={10} /> Connected
                  </span>
                ) : conn?.status === 'error' ? (
                  <span className="badge bg-red-100 text-red-700">
                    <AlertTriangle size={10} /> Error
                  </span>
                ) : (
                  <span className="badge bg-surface-muted text-text-muted">Not connected</span>
                )}
              </div>
              <a
                href={p.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                docs
              </a>
              <div className="mt-3 flex gap-2">
                {conn?.status === 'connected' ? (
                  <>
                    <button
                      className="btn-secondary text-xs flex-1 justify-center"
                      onClick={() => setOpenConnId(conn.id)}
                    >
                      Map fields <ArrowRight size={12} />
                    </button>
                    <button
                      className="btn-ghost text-xs text-red-600"
                      onClick={() => setDisconnectTarget(conn.id)}
                      aria-label="Disconnect"
                    >
                      <Unplug size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-primary text-xs flex-1 justify-center"
                    onClick={() => connect(p.key)}
                  >
                    Connect
                  </button>
                )}
              </div>
              {conn?.lastError && (
                <div className="text-xs text-red-600 mt-2 line-clamp-2">{conn.lastError}</div>
              )}
            </div>
          );
        })}
      </div>

      {openConnId && (
        <MappingEditor
          connectionId={openConnId}
          onClose={() => setOpenConnId(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <ConfirmDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
        title="Disconnect this CRM?"
        description="Saved field mappings will remain and can be reused if you reconnect later."
        confirmLabel="Disconnect"
        destructive
        loading={disconnectBusy}
        onConfirm={submitDisconnect}
      />
    </div>
  );
}

function MappingEditor({
  connectionId,
  onClose,
  onSaved,
}: {
  connectionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<FieldsResponse | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [tab, setTab] = useState<'lead' | 'contact' | 'opportunity'>('lead');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ endpoint: string; payload: unknown } | null>(null);

  useEffect(() => {
    void Promise.all([
      api.get<FieldsResponse>(`/crm/connections/${connectionId}/fields`),
      api.get<Mapping[]>(`/crm/connections/${connectionId}/mappings`),
    ])
      .then(([f, m]) => {
        setFields(f);
        setMappings(m.length > 0 ? m : seedDefaults(f));
      })
      .catch(() => {
        setFields(null);
      });
  }, [connectionId]);

  const byEntity = useMemo(() => {
    return {
      lead: mappings.filter((m) => m.entity === 'lead'),
      contact: mappings.filter((m) => m.entity === 'contact'),
      opportunity: mappings.filter((m) => m.entity === 'opportunity'),
    };
  }, [mappings]);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/crm/connections/${connectionId}/mappings`, {
        mappings: mappings.filter((m) => m.localField && m.remoteField),
      });
      toast.success('Field mappings saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save mappings');
    } finally {
      setSaving(false);
    }
  }

  async function testPush() {
    setTestResult(null);
    try {
      const r = await api.post<{ endpoint: string; payload: unknown }>(
        `/crm/connections/${connectionId}/test-push`,
        {},
      );
      setTestResult(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test push failed');
    }
  }

  function updateRow(index: number, patch: Partial<Mapping>) {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  function addRow(entity: Mapping['entity']) {
    setMappings((prev) => [
      ...prev,
      { entity, localField: '', remoteField: '', direction: 'push' },
    ]);
  }
  function removeRow(index: number) {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  }

  if (!fields) {
    return (
      <div className="mt-3 border-t border-border-default pt-3 text-xs text-text-muted">Loading…</div>
    );
  }

  const rowsForTab = byEntity[tab];
  const localFields = fields.local[tab];
  const remoteFields = fields.remote[tab];

  return (
    <div className="mt-3 border-t border-border-default pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Field mapping
        </div>
        <button className="btn-ghost text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="flex gap-1 border-b border-border-default -mb-px">
        {ENTITY_TABS.map((e) => (
          <button
            key={e}
            onClick={() => setTab(e)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px capitalize ${
              tab === e
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border-default">
            <th className="text-left py-1.5 font-medium">Local field</th>
            <th className="text-left py-1.5 font-medium">Remote field</th>
            <th className="text-left py-1.5 font-medium">Direction</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rowsForTab.map((row) => {
            const index = mappings.indexOf(row);
            return (
              <tr key={index} className="border-b border-border-subtle">
                <td className="py-1.5 pr-2">
                  <select
                    className="input text-xs h-8"
                    value={row.localField}
                    onChange={(e) => updateRow(index, { localField: e.target.value })}
                  >
                    <option value="">— pick local field —</option>
                    {localFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    className="input text-xs h-8 font-mono"
                    list={`remote-${tab}`}
                    value={row.remoteField}
                    onChange={(e) => updateRow(index, { remoteField: e.target.value })}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    className="input text-xs h-8"
                    value={row.direction}
                    onChange={(e) =>
                      updateRow(index, { direction: e.target.value as Mapping['direction'] })
                    }
                  >
                    <option value="push">Push</option>
                    <option value="pull">Pull</option>
                    <option value="both">Both</option>
                  </select>
                </td>
                <td className="py-1.5 text-right">
                  <button
                    className="text-text-muted hover:text-red-500 p-1"
                    onClick={() => removeRow(index)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <datalist id={`remote-${tab}`}>
        {remoteFields.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <div className="flex gap-2">
        <button className="btn-secondary text-xs" onClick={() => addRow(tab)}>
          + Add row
        </button>
        <button className="btn-secondary text-xs" onClick={testPush}>
          Preview push
        </button>
        <button className="btn-primary text-xs ml-auto" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save mappings'}
        </button>
      </div>

      {testResult && (
        <div className="rounded-lg border border-border-default bg-surface-muted p-3 text-xs">
          <div className="font-medium text-text-primary mb-1">Target endpoint</div>
          <code className="text-[11px] break-all block mb-2">{testResult.endpoint}</code>
          <div className="font-medium text-text-primary mb-1">Sample payload</div>
          <pre className="overflow-auto max-h-48 text-[11px]">
            {JSON.stringify(testResult.payload, null, 2)}
          </pre>
          <div className="text-text-muted mt-2">
            This is a dry run only — no record was created in the remote CRM.
          </div>
        </div>
      )}
    </div>
  );
}

function seedDefaults(fields: FieldsResponse): Mapping[] {
  // Pre-fill the most common pairs so the table isn't empty on first open.
  const out: Mapping[] = [];
  const guesses: Record<string, string[]> = {
    companyName: ['name', 'Name', 'title', 'dealname', 'Name'],
    companyWebsite: ['domain', 'website', 'Website'],
    firstName: ['firstname', 'FirstName', 'name'],
    lastName: ['lastname', 'LastName'],
    email: ['email', 'Email'],
    jobTitle: ['jobtitle', 'Title', 'title'],
    title: ['dealname', 'Name', 'title'],
    estimatedValue: ['amount', 'Amount', 'value'],
  };
  for (const entity of ENTITY_TABS) {
    for (const lf of fields.local[entity]) {
      const candidates = guesses[lf.key] ?? [];
      const match = fields.remote[entity].find((r) => candidates.includes(r));
      if (match) {
        out.push({
          entity,
          localField: lf.key,
          remoteField: match,
          direction: 'push',
        });
      }
    }
  }
  return out;
}
