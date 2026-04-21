import { useEffect, useState } from 'react';
import { Bot, Mail, Linkedin, MessageSquare, Send, Sparkles } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<AgentRow[]>('/agents')
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [refreshKey]);

  return (
    <StepAssistant
      key={`ab-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              <div className="font-medium text-slate-700 mb-1">Canonical agents</div>
              No agents yet. Approve a draft above and they’ll be written into{' '}
              <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">agent_profiles</code>.
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
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">{agent.name}</div>
          <div className="text-xs text-slate-500">
            <span className="capitalize">{agent.agentType}</span> ·{' '}
            <span className="capitalize">{agent.personalityStyle.replace(/_/g, ' ')}</span> ·{' '}
            {agent.isActive ? (
              <span className="text-emerald-600">Active</span>
            ) : (
              <span className="text-slate-400">Paused</span>
            )}
          </div>
          {agent.toneDescription && (
            <div className="text-xs text-slate-600 mt-1 line-clamp-2">{agent.toneDescription}</div>
          )}
        </div>
        <button className="btn-ghost text-xs" onClick={onToggle}>
          {open ? 'Hide test' : 'Test'}
        </button>
      </div>
      {open && (
        <div className="mt-3 border-t border-slate-100 pt-3">
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
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
          {icon} {label}
        </div>
        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <Sparkles size={10} /> Not generated yet
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
        {icon} {label}
      </div>
      {message.subject && (
        <div className="text-sm font-medium mt-1 text-slate-900">{message.subject}</div>
      )}
      <div className="text-xs text-slate-700 whitespace-pre-wrap mt-1 max-h-40 overflow-y-auto">
        {message.body}
      </div>
    </div>
  );
}
