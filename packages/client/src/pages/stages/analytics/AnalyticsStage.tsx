import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BarChart3, Database, LayoutDashboard, Play, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface SavedQueryRow {
  id: string;
  name: string;
  description: string | null;
  naturalLanguage: string;
  generatedSql: string | null;
  lastRunAt: string | null;
  lastResultCount: number | null;
}

interface DashboardRow {
  id: string;
  name: string;
  description: string | null;
  layout: unknown[];
}

interface AskResult {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
}

export function AnalyticsStage() {
  const stage = STAGE_BY_ID['analytics']!;
  const [question, setQuestion] = useState('');
  const [saveAs, setSaveAs] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedQueryRow[]>([]);
  const [dashboards, setDashboards] = useState<DashboardRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void api
      .get<SavedQueryRow[]>('/queries')
      .then(setSaved)
      .catch(() => setSaved([]));
    void api
      .get<DashboardRow[]>('/queries/dashboards')
      .then(setDashboards)
      .catch(() => setDashboards([]));
  }, [refreshKey]);

  async function createDashboard() {
    const name = prompt('Dashboard name?', 'New dashboard');
    if (!name) return;
    const r = await api.post<DashboardRow>('/queries/dashboards', { name, layout: [] });
    window.location.href = `/dashboards/${r.id}`;
  }

  async function removeDashboard(id: string) {
    if (!confirm('Delete this dashboard?')) return;
    await api.delete(`/queries/dashboards/${id}`);
    setRefreshKey((k) => k + 1);
  }

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<AskResult>('/queries/ask', {
        question: question.trim(),
        saveAs: saveAs.trim() || undefined,
      });
      setResult(r);
      if (saveAs.trim()) {
        setSaveAs('');
        setRefreshKey((k) => k + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed');
    } finally {
      setBusy(false);
    }
  }

  async function rerun(id: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<AskResult>(`/queries/${id}/run`, {});
      setResult(r);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-run failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this saved query?')) return;
    await api.delete(`/queries/${id}`);
    setRefreshKey((k) => k + 1);
  }

  return (
    <StepAssistant
      stage={stage}
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              <Database size={12} /> Ask in plain English
            </div>
            <textarea
              className="input text-sm"
              rows={2}
              placeholder='e.g. "Top 10 industries by reply rate in the last 30 days"'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <input
                className="input text-sm flex-1"
                placeholder="Save as (optional)"
                value={saveAs}
                onChange={(e) => setSaveAs(e.target.value)}
              />
              <button className="btn-primary" onClick={ask} disabled={busy || !question.trim()}>
                <Play size={12} /> {busy ? 'Running…' : 'Run'}
              </button>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Read-only · 8s timeout · sandboxed to your org and an allowlist of pipeline tables.
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Result · {result.rowCount} rows
                </div>
                {!saveAs && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setSaveAs(question.slice(0, 60))}
                  >
                    <Save size={12} /> Save…
                  </button>
                )}
              </div>
              <details className="text-xs mb-2">
                <summary className="text-slate-500 cursor-pointer">SQL</summary>
                <pre className="bg-slate-50 rounded p-2 mt-1 overflow-auto max-h-32">
                  {result.sql}
                </pre>
              </details>
              <ResultTable rows={result.rows} />
            </div>
          )}

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <LayoutDashboard size={12} /> Dashboards · {dashboards.length}
              </div>
              <button className="btn-secondary text-xs" onClick={createDashboard}>
                <Plus size={12} /> New
              </button>
            </div>
            {dashboards.length === 0 ? (
              <div className="text-xs text-slate-400">
                Build a dashboard by dragging widgets (stat cards, saved queries, stage
                progress, agent anomalies) onto a grid.
              </div>
            ) : (
              <div className="space-y-1">
                {dashboards.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <Link
                      to={`/dashboards/${d.id}`}
                      className="flex-1 min-w-0 text-sm font-medium truncate hover:text-brand-700"
                    >
                      <BarChart3 size={12} className="inline mr-1 text-slate-400" />
                      {d.name}
                      <span className="text-xs text-slate-400 ml-2">
                        {d.layout.length} widgets
                      </span>
                    </Link>
                    <button
                      onClick={() => removeDashboard(d.id)}
                      className="text-slate-300 hover:text-red-500 p-1"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Saved · saved_queries
            </div>
            {saved.length === 0 && (
              <div className="text-xs text-slate-400">
                Run a question with “Save as” filled in and it will appear here.
              </div>
            )}
            <div className="space-y-2">
              {saved.map((q) => (
                <div
                  key={q.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-medium text-slate-900 truncate">{q.name}</div>
                      <div className="text-xs text-slate-500 line-clamp-1">
                        {q.naturalLanguage}
                      </div>
                      {q.lastRunAt && (
                        <div className="text-[10px] text-slate-400 mt-1">
                          last run {new Date(q.lastRunAt).toLocaleString()}
                          {q.lastResultCount !== null && ` · ${q.lastResultCount} rows`}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => rerun(q.id)}
                        className="text-slate-400 hover:text-brand-600 p-1"
                        aria-label="Re-run"
                      >
                        <Play size={14} />
                      </button>
                      <button
                        onClick={() => remove(q.id)}
                        className="text-slate-300 hover:text-red-500 p-1"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) {
    return <div className="text-xs text-slate-400">No rows.</div>;
  }
  const cols = Object.keys(rows[0] ?? {});
  return (
    <div className="overflow-x-auto max-h-72">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 border-b border-slate-200">
            {cols.map((c) => (
              <th key={c} className="text-left py-1 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              {cols.map((c) => (
                <td key={c} className="py-1.5 pr-3 text-slate-700">
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <div className="text-xs text-slate-400 mt-1">+{rows.length - 50} more rows</div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
