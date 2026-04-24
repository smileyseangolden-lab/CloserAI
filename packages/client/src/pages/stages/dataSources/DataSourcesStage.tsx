import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Database, Plug } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface CatalogProvider {
  key: string;
  name: string;
  category: string;
  vendor?: string;
  description: string;
  docsUrl?: string;
}

interface DataSourceRow {
  id: string;
  providerKey: string;
  providerName: string;
  category: string;
  tier: 'starter' | 'scale' | 'enterprise';
  status: 'recommended' | 'connected' | 'skipped' | 'error';
  estimatedMonthlyCostUsd: string | null;
  monthlyBudgetUsd: string | null;
  reasoning: string | null;
}

export function DataSourcesStage() {
  const stage = STAGE_BY_ID['data-sources']!;
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [rows, setRows] = useState<DataSourceRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void api
      .get<CatalogProvider[]>('/data-sources/catalog')
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    void api
      .get<DataSourceRow[]>('/data-sources')
      .then(setRows)
      .catch(() => setRows([]));
  }, [refreshKey]);

  const totalCost = rows.reduce(
    (s, r) => s + Number(r.estimatedMonthlyCostUsd ?? 0),
    0,
  );
  const budget = rows.find((r) => r.monthlyBudgetUsd)?.monthlyBudgetUsd;

  return (
    <StepAssistant
      key={`ds-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          {rows.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
                  Approved stack · data_sources
                </div>
                <div className="text-xs text-text-muted">
                  ${totalCost.toLocaleString()}/mo
                  {budget && ` of $${Number(budget).toLocaleString()} budget`}
                </div>
              </div>
              <div className="space-y-2">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between bg-surface rounded-lg border border-border-default p-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary truncate">{r.providerName}</div>
                      <div className="text-xs text-text-muted">
                        <span className="capitalize">{r.tier}</span>
                        {r.estimatedMonthlyCostUsd &&
                          ` · ~$${Number(r.estimatedMonthlyCostUsd).toLocaleString()}/mo`}
                      </div>
                      {r.reasoning && (
                        <div className="text-xs text-text-secondary mt-1 line-clamp-2">{r.reasoning}</div>
                      )}
                    </div>
                    <StatusPill status={r.status} />
                  </div>
                ))}
              </div>
              <Link
                to="/admin/integrations"
                className="btn-secondary w-full justify-center mt-3"
              >
                <Plug size={14} /> Connect API keys in Admin
              </Link>
            </div>
          )}

          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
              <Database size={12} /> Available providers
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {catalog.map((p) => {
                const inStack = rows.find((r) => r.providerKey === p.key);
                return (
                  <div key={p.key} className="text-sm border-b border-border-subtle pb-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-text-primary">{p.name}</div>
                      {inStack ? (
                        <span className="badge bg-emerald-100 text-emerald-700">In stack</span>
                      ) : (
                        <span className="badge bg-surface-muted text-text-muted capitalize">
                          {p.category}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted">{p.description}</div>
                  </div>
                );
              })}
              {catalog.length === 0 && (
                <div className="text-xs text-text-muted">Loading catalog…</div>
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}

function StatusPill({ status }: { status: DataSourceRow['status'] }) {
  const styles: Record<DataSourceRow['status'], string> = {
    recommended: 'bg-amber-100 text-amber-700',
    connected: 'bg-emerald-100 text-emerald-700',
    skipped: 'bg-surface-muted text-text-muted',
    error: 'bg-red-100 text-red-700',
  };
  return <span className={`badge ${styles[status]}`}>{status}</span>;
}
