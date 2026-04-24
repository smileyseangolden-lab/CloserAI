import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface IcpRow {
  id: string;
  name: string;
  description: string | null;
  targetIndustries: string[] | null;
  targetCompanySizes: string[] | null;
  targetJobTitles: string[] | null;
  targetGeographies: string[] | null;
  buyingSignals: string[] | null;
  disqualifiers: string[] | null;
  priority: number;
}

export function IcpStage() {
  const stage = STAGE_BY_ID['icp']!;
  const [icps, setIcps] = useState<IcpRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushedAt, setPushedAt] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<IcpRow[]>('/icps')
      .then(setIcps)
      .catch(() => setIcps([]));
  }, [refreshKey]);

  async function pushToDataLayer() {
    setPushBusy(true);
    try {
      // Convert ICP industries/sizes into enrichment_rules patches on every
      // existing data_sources row. Conservative: only sets if currently empty.
      const sources = await api.get<Array<{ id: string; enrichmentRules: Record<string, unknown> }>>('/data-sources');
      const industries = Array.from(new Set(icps.flatMap((i) => i.targetIndustries ?? [])));
      const sizes = Array.from(new Set(icps.flatMap((i) => i.targetCompanySizes ?? [])));
      const titles = Array.from(new Set(icps.flatMap((i) => i.targetJobTitles ?? [])));
      const filters = { industries, companySizes: sizes, jobTitles: titles };
      await Promise.all(
        sources.map((s) =>
          api.patch(`/data-sources/${s.id}`, {
            enrichmentRules: { ...(s.enrichmentRules ?? {}), filters },
          }),
        ),
      );
      setPushedAt(new Date().toLocaleTimeString());
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <StepAssistant
      key={`icp-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      headerActions={
        icps.length > 0 ? (
          <button
            className="btn-secondary"
            onClick={pushToDataLayer}
            disabled={pushBusy}
            title="Apply these ICP filters to every connected data source"
          >
            {pushBusy ? 'Pushing…' : 'Apply to data layer'}
          </button>
        ) : null
      }
      sidePanel={
        <div className="space-y-3">
          {pushedAt && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Filters applied to data sources at {pushedAt}.
            </div>
          )}
          {icps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-default p-4 text-sm text-text-muted">
              <div className="font-medium text-text-primary mb-1">Canonical ICPs</div>
              No tiers yet. Approve the draft above and they’ll be written into{' '}
              <code className="text-xs bg-surface-muted px-1.5 py-0.5 rounded">
                ideal_customer_profiles
              </code>
              .
            </div>
          ) : (
            icps.map((icp, i) => <IcpCard key={icp.id} icp={icp} tier={tierLabel(i)} />)
          )}
        </div>
      }
    />
  );
}

function tierLabel(index: number): 'A' | 'B' | 'C' {
  if (index === 0) return 'A';
  if (index === 1) return 'B';
  return 'C';
}

function IcpCard({ icp, tier }: { icp: IcpRow; tier: 'A' | 'B' | 'C' }) {
  const tierColor =
    tier === 'A' ? 'bg-emerald-500' : tier === 'B' ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <div className="rounded-xl border border-border-default bg-surface p-4">
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-lg ${tierColor} text-white flex items-center justify-center font-bold text-sm flex-shrink-0`}
        >
          {tier}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-medium text-text-primary truncate">{icp.name}</div>
            <Target size={12} className="text-text-muted" />
          </div>
          {icp.description && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{icp.description}</p>
          )}
          <CriteriaRow label="Industries" values={icp.targetIndustries} />
          <CriteriaRow label="Sizes" values={icp.targetCompanySizes} />
          <CriteriaRow label="Titles" values={icp.targetJobTitles} />
          {icp.buyingSignals && icp.buyingSignals.length > 0 && (
            <div className="text-xs mt-1.5">
              <span className="font-medium text-text-primary">Signals:</span>{' '}
              <span className="text-text-secondary">{icp.buyingSignals.slice(0, 3).join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CriteriaRow({ label, values }: { label: string; values: string[] | null }) {
  if (!values || values.length === 0) return null;
  return (
    <div className="text-xs mt-1.5 flex flex-wrap items-baseline gap-1">
      <span className="font-medium text-text-primary">{label}:</span>
      {values.slice(0, 4).map((v, i) => (
        <span key={i} className="badge bg-surface-muted text-text-secondary">
          {v}
        </span>
      ))}
      {values.length > 4 && <span className="text-text-muted">+{values.length - 4}</span>}
    </div>
  );
}
