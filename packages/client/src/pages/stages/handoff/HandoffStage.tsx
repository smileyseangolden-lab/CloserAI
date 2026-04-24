import { useEffect, useState } from 'react';
import { FileText, UserCog, Wand2, Trash2 } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';
import { ConfirmDialog, toast } from '../../../components/ui';

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
  const [packetOppId, setPacketOppId] = useState('');
  const [packetLeadId, setPacketLeadId] = useState('');
  const [packet, setPacket] = useState<string | null>(null);
  const [packetBusy, setPacketBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RuleRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/handoff/rules/${deleteTarget.id}`);
      toast.success('Rule deleted');
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function generatePacket() {
    if (!packetOppId.trim() && !packetLeadId.trim()) return;
    setPacketBusy(true);
    setPacket(null);
    try {
      const r = await api.post<{ packet: string }>('/handoff/context-packet', {
        opportunityId: packetOppId.trim() || undefined,
        leadId: packetLeadId.trim() || undefined,
      });
      setPacket(r.packet);
    } catch (err) {
      setPacket(
        `**Error**\n\n${err instanceof Error ? err.message : 'Could not generate packet.'}`,
      );
    } finally {
      setPacketBusy(false);
    }
  }

  return (
    <>
    <StepAssistant
      key={`hand-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
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
              <pre className="text-xs bg-surface-muted rounded p-3 mt-3 overflow-auto max-h-48">
                {JSON.stringify(compiled, null, 2)}
              </pre>
            )}
          </div>

          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
              <UserCog size={12} /> Rules · handoff_rules
            </div>
            {rules.length === 0 && (
              <div className="text-xs text-text-muted">
                Compile a rule above, or approve a draft to seed rules in bulk.
              </div>
            )}
            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="bg-surface border border-border-default rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-medium text-text-primary truncate">{r.name}</div>
                      <div className="text-xs text-text-secondary line-clamp-2">
                        {r.naturalLanguageRule}
                      </div>
                    </div>
                    <button
                      onClick={() => setDeleteTarget(r)}
                      className="text-text-muted hover:text-red-500 p-1"
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs text-text-muted cursor-pointer">
                      trigger config
                    </summary>
                    <pre className="text-[10px] bg-surface-muted rounded p-2 mt-1 overflow-auto max-h-32">
                      {JSON.stringify(r.triggerConfig, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
              <FileText size={12} /> Preview context packet
            </div>
            <div className="text-xs text-text-muted mb-2">
              Paste a lead or opportunity id and Claude will render a 60-second brief from the
              actual pipeline data.
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                className="input text-xs"
                placeholder="opportunityId"
                value={packetOppId}
                onChange={(e) => setPacketOppId(e.target.value)}
              />
              <input
                className="input text-xs"
                placeholder="leadId"
                value={packetLeadId}
                onChange={(e) => setPacketLeadId(e.target.value)}
              />
            </div>
            <button
              className="btn-primary w-full justify-center"
              onClick={generatePacket}
              disabled={packetBusy || (!packetOppId.trim() && !packetLeadId.trim())}
            >
              {packetBusy ? 'Assembling…' : 'Generate packet'}
            </button>
            {packet && (
              <pre className="text-xs bg-surface-muted rounded p-3 mt-3 overflow-auto max-h-80 whitespace-pre-wrap font-sans">
                {packet}
              </pre>
            )}
          </div>

          {paths.length > 0 && (
            <div className="rounded-xl border border-border-default p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
                Escalation paths · escalation_paths
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-muted border-b border-border-default">
                    <th className="text-left py-1">Role</th>
                    <th className="text-left py-1">SLA</th>
                    <th className="text-left py-1">Channels</th>
                  </tr>
                </thead>
                <tbody>
                  {paths.map((p) => (
                    <tr key={p.id} className="border-b border-border-subtle">
                      <td className="py-2 capitalize">{p.role.replace(/_/g, ' ')}</td>
                      <td className="py-2">{p.slaMinutes}m</td>
                      <td className="py-2 text-text-secondary">
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
    <ConfirmDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}
      title="Delete handoff rule?"
      description="Leads matching this rule will stop routing to their current path."
      confirmLabel="Delete"
      destructive
      loading={deleteBusy}
      onConfirm={confirmDelete}
    />
    </>
  );
}
