import { useEffect, useState } from 'react';
import {
  UserCog,
  Megaphone,
  Crown,
  Zap,
  Power,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../../api/client';

type ManagerRole = 'sales_manager' | 'marketing_manager' | 'cro';
type Cadence = 'hourly' | 'daily' | 'weekly' | 'manual';

interface Blueprint {
  role: ManagerRole;
  name: string;
  description: string;
  cadence: Cadence;
  systemPrompt: string;
}

interface ManagerAgent {
  id: string;
  role: ManagerRole;
  name: string;
  description: string | null;
  cadence: Cadence;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunSummary: string | null;
}

interface Digest {
  id: string;
  managerAgentId: string;
  role: ManagerRole;
  cadence: Cadence;
  content: string;
  summary: string | null;
  metrics: Record<string, unknown>;
  proposalsCreated: number;
  knowledgeCreated: number;
  createdAt: string;
}

const ICONS: Record<ManagerRole, React.ComponentType<{ size?: number }>> = {
  sales_manager: UserCog,
  marketing_manager: Megaphone,
  cro: Crown,
};

export function ManagersPanel() {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [managers, setManagers] = useState<ManagerAgent[]>([]);
  const [digests, setDigests] = useState<Digest[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedDigestId, setExpandedDigestId] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<Blueprint[]>('/managers/catalog')
      .then(setBlueprints)
      .catch(() => setBlueprints([]));
  }, []);

  useEffect(() => {
    void Promise.all([
      api.get<ManagerAgent[]>('/managers'),
      api.get<Digest[]>('/managers/digests/recent'),
    ])
      .then(([m, d]) => {
        setManagers(m);
        setDigests(d);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  const managerByRole = new Map(managers.map((m) => [m.role, m]));

  async function enable(role: ManagerRole, cadence?: Cadence) {
    await api.post('/managers/enable', { role, cadence });
    setRefreshKey((k) => k + 1);
  }
  async function toggle(id: string, active: boolean) {
    await api.patch(`/managers/${id}`, { isActive: active });
    setRefreshKey((k) => k + 1);
  }
  async function setCadence(id: string, cadence: Cadence) {
    await api.patch(`/managers/${id}`, { cadence });
    setRefreshKey((k) => k + 1);
  }
  async function runNow(id: string) {
    setRunningId(id);
    try {
      await api.post(`/managers/${id}/run-now`, {});
      setTimeout(() => setRefreshKey((k) => k + 1), 20_000);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {blueprints.map((bp) => {
          const m = managerByRole.get(bp.role);
          const Icon = ICONS[bp.role];
          return (
            <div
              key={bp.role}
              className={`rounded-xl border p-4 ${
                m?.isActive
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    m?.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-slate-900">{bp.name}</div>
                    {m?.isActive ? (
                      <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                    ) : m ? (
                      <span className="badge bg-slate-100 text-slate-500">Paused</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-500">Not enabled</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">{bp.description}</p>
                  {m?.lastRunAt && (
                    <div className="text-xs text-slate-500 mt-1">
                      Last run {new Date(m.lastRunAt).toLocaleString()}
                      {m.nextRunAt && (
                        <>
                          {' '}
                          · next{' '}
                          {new Date(m.nextRunAt) < new Date()
                            ? 'on the next tick'
                            : new Date(m.nextRunAt).toLocaleString()}
                        </>
                      )}
                    </div>
                  )}
                  {m?.lastRunSummary && (
                    <div className="text-xs text-slate-700 italic mt-1 line-clamp-2">
                      “{m.lastRunSummary}”
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {m ? (
                      <>
                        <select
                          className="input text-xs h-8 w-auto"
                          value={m.cadence}
                          onChange={(e) => setCadence(m.id, e.target.value as Cadence)}
                        >
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="manual">Manual only</option>
                        </select>
                        <button
                          className="btn-secondary text-xs"
                          onClick={() => toggle(m.id, !m.isActive)}
                        >
                          <Power size={12} /> {m.isActive ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          className="btn-primary text-xs"
                          onClick={() => runNow(m.id)}
                          disabled={runningId === m.id}
                        >
                          <Zap size={12} /> {runningId === m.id ? 'Queued…' : 'Run now'}
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn-primary text-xs"
                        onClick={() => enable(bp.role, bp.cadence)}
                      >
                        Enable — default {bp.cadence}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          <FileText size={12} /> Recent digests · {digests.length}
        </div>
        {digests.length === 0 ? (
          <div className="text-xs text-slate-400">
            No digests yet. Enable a manager and run it to see its brief here.
          </div>
        ) : (
          <div className="space-y-2">
            {digests.map((d) => (
              <div key={d.id} className="bg-white border border-slate-200 rounded-lg">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() =>
                    setExpandedDigestId((cur) => (cur === d.id ? null : d.id))
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-slate-100 text-slate-600 capitalize text-[10px]">
                        {d.role.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 capitalize">
                        {d.cadence}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(d.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 mt-0.5 line-clamp-1 italic">
                      {d.summary}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {d.proposalsCreated > 0 && (
                      <span className="text-[10px] text-brand-600">
                        +{d.proposalsCreated} proposals
                      </span>
                    )}
                    {d.knowledgeCreated > 0 && (
                      <span className="text-[10px] text-emerald-600">
                        +{d.knowledgeCreated} KB
                      </span>
                    )}
                    {expandedDigestId === d.id ? (
                      <ChevronDown size={14} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-400" />
                    )}
                  </div>
                </button>
                {expandedDigestId === d.id && (
                  <div className="border-t border-slate-100 px-3 py-3">
                    <pre className="text-xs bg-slate-50 rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap font-sans">
                      {d.content}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
