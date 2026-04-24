import { useEffect, useState } from 'react';
import { Bot, Mail, Linkedin, MessageSquare, Send, Sparkles, Users, Check } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';
import { toast } from '../../../components/ui';

interface CatalogAgent {
  key: string;
  name: string;
  category: string;
  agentType: string;
  personalityStyle: string;
  channels: string[];
  description: string;
  motions: string[];
}

type Motion = 'outbound_heavy' | 'inbound_heavy' | 'partner_driven' | 'plg';
const MOTIONS: Array<{ value: Motion; label: string }> = [
  { value: 'outbound_heavy', label: 'Outbound-heavy' },
  { value: 'inbound_heavy', label: 'Inbound-heavy' },
  { value: 'partner_driven', label: 'Partner-driven' },
  { value: 'plg', label: 'PLG' },
];

interface AgentRow {
  id: string;
  name: string;
  agentType: string;
  personalityStyle: string;
  toneDescription: string | null;
  systemPromptOverride: string | null;
  senderName: string;
  senderTitle: string | null;
  isActive: boolean;
}

interface TestMessage {
  subject?: string;
  body: string;
}

export function AgentBuilderStage() {
  const stage = STAGE_BY_ID['agent-builder']!;
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogAgent[]>([]);
  const [motion, setMotion] = useState<Motion>('outbound_heavy');
  const [recommendedKeys, setRecommendedKeys] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<AgentRow[]>('/agents')
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [refreshKey]);

  useEffect(() => {
    void api
      .get<CatalogAgent[]>('/agents/catalog')
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    void api
      .get<{ keys: string[] }>(`/agents/catalog/squad?motion=${motion}`)
      .then((r) => setRecommendedKeys(new Set(r.keys)))
      .catch(() => setRecommendedKeys(new Set()));
  }, [motion]);

  const activeNames = new Set(agents.map((a) => a.name));

  async function activate(key: string) {
    setActivating(key);
    try {
      await api.post(`/agents/catalog/${key}/activate`, {});
      toast.success('Agent activated');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not activate agent');
    } finally {
      setActivating(null);
    }
  }

  return (
    <StepAssistant
      key={`ab-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
              <Users size={12} /> Squad catalog · {catalog.length} agents
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-text-muted">Motion:</span>
              <select
                className="input h-8 text-xs w-auto"
                value={motion}
                onChange={(e) => setMotion(e.target.value as Motion)}
              >
                {MOTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-text-muted">
                {recommendedKeys.size} recommended
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
              {catalog.map((c) => {
                const isActive = activeNames.has(c.name);
                const isRecommended = recommendedKeys.has(c.key);
                return (
                  <div
                    key={c.key}
                    className={`rounded-lg border p-2.5 text-xs ${
                      isActive
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : isRecommended
                          ? 'border-brand-200 bg-brand-50/30'
                          : 'border-border-default bg-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className="font-medium text-text-primary truncate">{c.name}</div>
                      {isRecommended && !isActive && (
                        <span className="badge bg-brand-500 text-white text-[9px]">Rec</span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted capitalize mb-1">
                      {c.category} · {c.channels.join('/')}
                    </div>
                    <div className="text-text-secondary line-clamp-2 mb-2">{c.description}</div>
                    {isActive ? (
                      <div className="flex items-center gap-1 text-emerald-700">
                        <Check size={12} /> Active
                      </div>
                    ) : (
                      <button
                        className="btn-secondary text-xs w-full justify-center"
                        disabled={activating === c.key}
                        onClick={() => activate(c.key)}
                      >
                        {activating === c.key ? 'Activating…' : 'Activate'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-default p-4 text-sm text-text-muted">
              <div className="font-medium text-text-primary mb-1">Canonical agents</div>
              No agents yet. Activate from the squad catalog or approve a draft above.
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 uppercase tracking-wide mb-3">
                <Bot size={12} /> {agents.length} agents · agent_profiles
              </div>
              <div className="space-y-2">
                {agents.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    open={openId === a.id}
                    onToggle={() => setOpenId((cur) => (cur === a.id ? null : a.id))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      }
    />
  );
}

function AgentCard({
  agent,
  open,
  onToggle,
}: {
  agent: AgentRow;
  open: boolean;
  onToggle: () => void;
}) {
  const [scenario, setScenario] = useState('');
  const [results, setResults] = useState<Partial<Record<'email' | 'linkedin' | 'sms', TestMessage>>>(
    {},
  );
  const [busy, setBusy] = useState(false);

  async function runVariants() {
    if (!scenario.trim()) return;
    setBusy(true);
    setResults({});
    try {
      // Generate one per channel via the existing test-message endpoint, with
      // a tiny channel hint baked into the scenario.
      const channels: Array<'email' | 'linkedin' | 'sms'> = ['email', 'linkedin', 'sms'];
      const out: typeof results = {};
      await Promise.all(
        channels.map(async (ch) => {
          try {
            const r = await api.post<TestMessage>(`/agents/${agent.id}/test-message`, {
              scenario: `${scenario}\n\nChannel: ${ch.toUpperCase()}. Adapt length and formality to channel norms (email = full message, LinkedIn = ≤300 chars + warmer, SMS = ≤160 chars + casual).`,
            });
            out[ch] = r;
          } catch {
            // ignore per-channel
          }
        }),
      );
      setResults(out);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface rounded-lg border border-border-default p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-medium text-text-primary truncate">{agent.name}</div>
          <div className="text-xs text-text-muted">
            <span className="capitalize">{agent.agentType}</span> ·{' '}
            <span className="capitalize">{agent.personalityStyle.replace(/_/g, ' ')}</span> ·{' '}
            {agent.isActive ? (
              <span className="text-emerald-600">Active</span>
            ) : (
              <span className="text-text-muted">Paused</span>
            )}
          </div>
          {agent.toneDescription && (
            <div className="text-xs text-text-secondary mt-1 line-clamp-2">{agent.toneDescription}</div>
          )}
        </div>
        <button className="btn-ghost text-xs" onClick={onToggle}>
          {open ? 'Hide test' : 'Test'}
        </button>
      </div>
      {open && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Scenario (e.g. cold intro to a VP Sales at a 200-person SaaS)"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            />
            <button
              className="btn-primary"
              onClick={runVariants}
              disabled={busy || !scenario.trim()}
            >
              <Send size={12} /> {busy ? 'Generating…' : 'Run all 3 channels'}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <ChannelResult icon={<Mail size={12} />} label="Email" message={results.email} />
            <ChannelResult
              icon={<Linkedin size={12} />}
              label="LinkedIn"
              message={results.linkedin}
            />
            <ChannelResult icon={<MessageSquare size={12} />} label="SMS" message={results.sms} />
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelResult({
  icon,
  label,
  message,
}: {
  icon: React.ReactNode;
  label: string;
  message: TestMessage | undefined;
}) {
  if (!message) {
    return (
      <div className="rounded-lg border border-border-default bg-surface-muted p-3">
        <div className="text-xs font-medium text-text-muted uppercase tracking-wide flex items-center gap-1">
          {icon} {label}
        </div>
        <div className="text-xs text-text-muted mt-1 flex items-center gap-1">
          <Sparkles size={10} /> Not generated yet
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border-default bg-surface p-3">
      <div className="text-xs font-medium text-text-muted uppercase tracking-wide flex items-center gap-1">
        {icon} {label}
      </div>
      {message.subject && (
        <div className="text-sm font-medium mt-1 text-text-primary">{message.subject}</div>
      )}
      <div className="text-xs text-text-primary whitespace-pre-wrap mt-1 max-h-40 overflow-y-auto">
        {message.body}
      </div>
    </div>
  );
}
