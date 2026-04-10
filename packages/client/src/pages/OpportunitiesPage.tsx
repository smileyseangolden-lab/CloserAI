import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';

interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  stage: string;
  estimatedValue: string | null;
  probability: number;
  expectedCloseDate: string | null;
}

const STAGES: Array<{ key: string; label: string }> = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'verbal_commit', label: 'Verbal' },
  { key: 'closed_won', label: 'Won' },
];

export function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);

  useEffect(() => {
    void api.get<Opportunity[]>('/opportunities').then(setOpps);
  }, []);

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader title="Pipeline" subtitle="Deal kanban board" />

      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {STAGES.map((stage) => {
            const stageOpps = opps.filter((o) => o.stage === stage.key);
            const total = stageOpps.reduce(
              (sum, o) => sum + Number(o.estimatedValue ?? 0),
              0,
            );
            return (
              <div key={stage.key} className="w-72 flex-shrink-0">
                <div className="card">
                  <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{stage.label}</div>
                      <div className="text-xs text-slate-500">
                        {stageOpps.length} · ${total.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[400px]">
                    {stageOpps.map((o) => (
                      <div
                        key={o.id}
                        className="p-3 rounded-lg border border-slate-100 bg-white hover:shadow-sm cursor-pointer"
                      >
                        <div className="font-medium text-sm mb-1">{o.title}</div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>${Number(o.estimatedValue ?? 0).toLocaleString()}</span>
                          <span>{o.probability}%</span>
                        </div>
                      </div>
                    ))}
                    {stageOpps.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-4">Empty</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
