import { useEffect, useState } from 'react';
import { UserCog, Wand2, Trash2 } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface RuleRow {
  id: string;
  name: string;
  naturalLanguageRule: string;
  triggerConfig: Record<string, unknown>;
  priority: number;
  isActive: boolean;
}

interface PathRow {
  id: string;
  handoffRuleId: string | null;
  assignedUserId: string | null;
  role: string;
  slaMinutes: number;
  contextPacketTemplate: string | null;
  notificationChannels: string[] | null;
  sortOrder: number;
}

export function HandoffStage() {
  const stage = STAGE_BY_ID['handoff']!;
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [paths, setPaths] = useState<PathRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [compileInput, setCompileInput] = useState('');
  const [compiled, setCompiled] = useState<unknown>(null);
  const [compiling, setCompiling] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.get<RuleRow[]>('/handoff/rules'),
      api.get<PathRow[]>('/handoff/paths'),
    ])
      .then(([r, p]) => {
        setRules(r);
        setPaths(p.sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch(() => undefined);
  }, [refreshKey]);

  async function compileNL() {
    if (!compileInput.trim()) return;
    setCompiling(true);
    try {
      const out = await api.post<unknown>('/handoff/rules/compile', {
        naturalLanguageRule: compileInput.trim(),
      });
      setCompiled(out);
    } finally {
      setCompiling(false);
    }
  }

  async function saveCompiled() {
    if (!compileInput.trim() || !compiled) return;
    await api.post('/handoff/rules', {
      name: compileInput.slice(0, 60),
      naturalLanguageRule: compileInput,
      triggerConfig: compiled as Record<string, unknown>,
      priority: rules.length,
    });
    setCompileInput('');
    setCompiled(null);
    setRefreshKey((k) => k + 1);
  }

  async function removeRule(id: string) {
    if (!confirm('Delete this handoff rule?')) return;
    await api.delete(`/handoff/rules/${id}`);
    setRefreshKey((k) => k + 1);
  }

  return (
    <StepAssistant
      key={`hand-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              <Wand2 size={12} /> Compile natural-language rule
            </div>
            <textarea
              className="input text-sm"
              rows={2}
              placeholder='e.g. "any enterprise opportunity over $50K, escalate to a Sales Lead within 30 minutes"'
              value={compileInput}
              onChange={(e) => setCompileInput(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <button
                className="btn-secondary"
                onClick={compileNL}
                disabled={compiling || !compileInput.trim()}
              >
                {compiling ? 'Compiling…' : 'Compile'}
              </button>
              {compiled && (
                <button className="btn-primary" onClick={saveCompiled}>
                  Save as rule
                </button>
              )}
            </div>
            {compiled !== null && (
              <pre className="text-xs bg-slate-50 rounded p-3 mt-3 overflow-auto max-h-48">
                {JSON.stringify(compiled, null, 2)}
              </pre>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              <UserCog size={12} /> Rules · handoff_rules
            </div>
            {rules.length === 0 && (
              <div className="text-xs text-slate-400">
                Compile a rule above, or approve a draft to seed rules in bulk.
              </div>
            )}
            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-medium text-slate-900 truncate">{r.name}</div>
                      <div className="text-xs text-slate-600 line-clamp-2">
                        {r.naturalLanguageRule}
                      </div>
                    </div>
                    <button
                      onClick={() => removeRule(r.id)}
                      className="text-slate-300 hover:text-red-500 p-1"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs text-slate-500 cursor-pointer">
                      trigger config
                    </summary>
                    <pre className="text-[10px] bg-slate-50 rounded p-2 mt-1 overflow-auto max-h-32">
                      {JSON.stringify(r.triggerConfig, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>

          {paths.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                Escalation paths · escalation_paths
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1">Role</th>
                    <th className="text-left py-1">SLA</th>
                    <th className="text-left py-1">Channels</th>
                  </tr>
                </thead>
                <tbody>
                  {paths.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-2 capitalize">{p.role.replace(/_/g, ' ')}</td>
                      <td className="py-2">{p.slaMinutes}m</td>
                      <td className="py-2 text-slate-600">
                        {(p.notificationChannels ?? []).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      }
    />
  );
}
