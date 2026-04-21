import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Sparkles, Check, RotateCcw, User, Bot } from 'lucide-react';
import { api } from '../../api/client';
import type { StageDefinition } from '../../workflow/stages';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedDraft?: Record<string, unknown> | null;
  createdAt: string;
}

interface WorkspaceStage {
  id: string;
  stageId: string;
  status: 'locked' | 'in_progress' | 'approved';
  data: Record<string, unknown>;
  version: number;
  approvedAt: string | null;
  updatedAt: string;
}

interface ChatResponse {
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
  proposedDraft: Record<string, unknown> | null;
  toolTrace?: Array<{ name: string; input: unknown; result: string }>;
  model?: string;
}

interface Props {
  stage: StageDefinition;
  /** Optional canonical-table panel rendered below the live preview. */
  sidePanel?: ReactNode;
  /** Stage-specific quick actions in the header (e.g. "Analyze my website"). */
  headerActions?: ReactNode;
  /** Called when the assistant returns a new draft so a parent can reflect changes. */
  onDraftChanged?: (draft: Record<string, unknown>) => void;
  /** Called when the user approves the stage so a parent can refresh canonical data. */
  onApproved?: () => void;
}

export function StepAssistant({
  stage,
  sidePanel,
  headerActions,
  onDraftChanged,
  onApproved,
}: Props) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<WorkspaceStage['status']>('in_progress');
  const [version, setVersion] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoaded(false);
      try {
        const [history, ws] = await Promise.all([
          api.get<AssistantMessage[]>(`/assistant/${stage.id}/history`),
          api.get<WorkspaceStage | null>(`/workspace/${stage.id}`),
        ]);
        if (cancelled) return;
        setMessages(history);
        if (ws) {
          setDraft(ws.data ?? {});
          setStatus(ws.status);
          setVersion(ws.version);
        } else {
          setDraft({});
          setStatus('in_progress');
          setVersion(0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [stage.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    const optimistic: AssistantMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await api.post<ChatResponse>(`/assistant/${stage.id}/chat`, { message: text });
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimistic.id);
        return [...withoutOptimistic, res.userMessage, res.assistantMessage];
      });
      if (res.proposedDraft) {
        setDraft((prev) => {
          const next = { ...prev, ...res.proposedDraft };
          onDraftChanged?.(next);
          return next;
        });
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setBusy(false);
    }
  }

  async function save(nextStatus: 'in_progress' | 'approved') {
    setSaving(true);
    setError(null);
    try {
      const ws = await api.put<WorkspaceStage>(`/workspace/${stage.id}`, {
        data: draft,
        status: nextStatus,
      });
      setStatus(ws.status);
      setVersion(ws.version);
      if (nextStatus === 'approved') onApproved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function resetConversation() {
    if (!confirm('Clear the conversation for this stage?')) return;
    try {
      await api.delete(`/assistant/${stage.id}/history`);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    }
  }

  const hasDraft = useMemo(() => Object.keys(draft).length > 0, [draft]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-start justify-between px-8 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <stage.icon size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Stage {stage.order}
              </div>
              <StatusPill status={status} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{stage.title}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{stage.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            className="btn-secondary"
            onClick={resetConversation}
            disabled={messages.length === 0}
            title="Clear this stage's conversation"
          >
            <RotateCcw size={14} /> Reset chat
          </button>
          <button
            className="btn-secondary"
            disabled={saving || !hasDraft}
            onClick={() => save('in_progress')}
          >
            Save draft
          </button>
          <button
            className="btn-primary"
            disabled={saving || !hasDraft}
            onClick={() => save('approved')}
          >
            <Check size={14} /> Save &amp; Continue
          </button>
        </div>
      </header>

      {error && (
        <div className="px-8 py-2 bg-red-50 text-red-700 text-sm border-b border-red-100">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] flex-1 min-h-0">
        <section className="flex flex-col min-h-0 border-r border-slate-200 bg-slate-50">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {!loaded ? (
              <div className="text-sm text-slate-400">Loading...</div>
            ) : messages.length === 0 ? (
              <OpeningCard stage={stage} />
            ) : (
              messages.map((m) => <ChatBubble key={m.id} message={m} />)
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Sparkles size={14} className="animate-pulse" /> Thinking...
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white px-8 py-4">
            <div className="flex gap-2">
              <textarea
                className="input flex-1 resize-none"
                rows={2}
                placeholder="Type your reply..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button className="btn-primary self-end" disabled={busy || !input.trim()} onClick={send}>
                <Send size={14} /> Send
              </button>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              ⌘/Ctrl + Enter to send. This assistant has all previously approved stages in context.
            </div>
          </div>
        </section>

        <section className="flex flex-col min-h-0 bg-white">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Live preview
              </div>
              <div className="text-sm text-slate-600">
                {hasDraft ? `${Object.keys(draft).length} fields populated` : 'Nothing proposed yet'}
                {version > 0 && <span className="text-slate-400"> · v{version}</span>}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {stage.draftFields.map((f) => (
              <DraftField
                key={f.key}
                field={f}
                value={draft[f.key]}
                onChange={(v) => setDraft((prev) => ({ ...prev, [f.key]: v }))}
              />
            ))}
            <DraftExtras
              draft={draft}
              knownKeys={new Set(stage.draftFields.map((f) => f.key))}
              onChange={setDraft}
            />
            {sidePanel && (
              <div className="pt-4 border-t border-slate-200">{sidePanel}</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function OpeningCard({ stage }: { stage: StageDefinition }) {
  return (
    <div className="card p-6 max-w-xl">
      <div className="flex items-center gap-2 text-xs font-medium text-brand-600 uppercase tracking-wide mb-2">
        <Sparkles size={14} />
        Your {stage.title} assistant
      </div>
      <p className="text-slate-800 text-base leading-relaxed">“{stage.openingPrompt}”</p>
      <p className="text-sm text-slate-500 mt-3">
        You never fill out a blank form here. Describe things in plain language and I’ll draft the
        structured output on the right. Edit anything inline and I’ll incorporate it.
      </p>
    </div>
  );
}

function ChatBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${
          isUser ? 'bg-slate-700 text-white' : 'bg-brand-100 text-brand-700'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block text-sm leading-relaxed rounded-2xl px-4 py-2.5 whitespace-pre-wrap ${
            isUser ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-800'
          }`}
        >
          {message.content}
        </div>
        {message.proposedDraft && (
          <div className="mt-1 text-xs text-brand-600 flex items-center gap-1">
            <Sparkles size={12} /> Proposed updates applied to the preview
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: 'locked' | 'in_progress' | 'approved' }) {
  const styles: Record<typeof status, string> = {
    locked: 'bg-slate-100 text-slate-500',
    in_progress: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
  };
  const label: Record<typeof status, string> = {
    locked: 'Not started',
    in_progress: 'In progress',
    approved: 'Approved',
  };
  return <span className={`badge ${styles[status]}`}>{label[status]}</span>;
}

function DraftField({
  field,
  value,
  onChange,
}: {
  field: StageDefinition['draftFields'][number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.kind === 'text') {
    return (
      <div>
        <label className="label">{field.label}</label>
        <textarea
          className="input"
          rows={2}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  if (field.kind === 'list') {
    const items = Array.isArray(value) ? (value as unknown[]) : [];
    return (
      <div>
        <label className="label">{field.label}</label>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input"
                value={typeof item === 'string' ? item : JSON.stringify(item)}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = e.target.value;
                  onChange(next);
                }}
              />
              <button
                className="btn-ghost"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="btn-secondary w-full justify-center"
            onClick={() => onChange([...items, ''])}
          >
            + Add
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className="label">{field.label}</label>
      <textarea
        className="input font-mono text-xs"
        rows={4}
        value={value ? JSON.stringify(value, null, 2) : ''}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            // Keep typing; don't crash.
          }
        }}
      />
    </div>
  );
}

function DraftExtras({
  draft,
  knownKeys,
  onChange,
}: {
  draft: Record<string, unknown>;
  knownKeys: Set<string>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const extras = Object.entries(draft).filter(([k]) => !knownKeys.has(k));
  if (extras.length === 0) return null;
  return (
    <div className="pt-4 border-t border-dashed border-slate-200">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">
        Additional assistant output
      </div>
      <pre className="text-xs bg-slate-50 rounded-lg p-3 overflow-auto max-h-64">
        {JSON.stringify(Object.fromEntries(extras), null, 2)}
      </pre>
      <button
        className="btn-ghost text-xs mt-2"
        onClick={() => {
          const pruned: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(draft)) if (knownKeys.has(k)) pruned[k] = v;
          onChange(pruned);
        }}
      >
        Clear extras
      </button>
    </div>
  );
}
