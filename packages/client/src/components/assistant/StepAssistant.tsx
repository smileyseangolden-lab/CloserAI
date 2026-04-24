import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Sparkles, Check, RotateCcw, User, Bot, Mic, Wand2 } from 'lucide-react';
import { api } from '../../api/client';
import type { StageDefinition } from '../../workflow/stages';
import { ConfirmDialog, toast } from '../ui';

// Minimal Web Speech API shape — not in the default DOM lib types.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number };
  }) => void;
  onend: () => void;
  onerror: () => void;
  start(): void;
  stop(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  }
}

const REFINE_COMMANDS: Array<{ label: string; prompt: string }> = [
  { label: 'Shorter', prompt: 'Make it shorter. Cut the draft to the essentials.' },
  { label: 'More technical', prompt: 'Rewrite more technically — use precise terminology.' },
  { label: 'More proof', prompt: 'Add 2–3 concrete proof points to the draft.' },
  { label: 'Tighten', prompt: 'Tighten the phrasing. Remove filler and hedging.' },
  { label: 'More emotional', prompt: 'Lean more on the emotional angle in the draft.' },
];

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

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setError(null);
    const optimisticId = `tmp-user-${Date.now()}`;
    const streamingId = `tmp-ast-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: 'user', content: text, createdAt: new Date().toISOString() },
      { id: streamingId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ]);

    try {
      const url = `/assistant/${stage.id}/chat/stream?message=${encodeURIComponent(text)}`;
      const res = await api.fetchRaw(url);
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      let accumulated = '';
      let userSaved: AssistantMessage | null = null;
      let assistantSaved: AssistantMessage | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const frames = buffered.split('\n\n');
        buffered = frames.pop() ?? '';
        for (const frame of frames) {
          if (!frame.trim()) continue;
          const lines = frame.split('\n');
          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
          }
          const data = dataLines.join('\n');
          if (!data) continue;
          try {
            const payload = JSON.parse(data);
            if (eventName === 'user_saved') {
              userSaved = payload as AssistantMessage;
              continue;
            }
            if (eventName === 'assistant_saved') {
              assistantSaved = payload as AssistantMessage;
              continue;
            }
            handleStreamEvent(payload);
          } catch {
            // ignore malformed frame
          }
        }
      }

      setMessages((prev) => {
        const out = prev.filter((m) => m.id !== optimisticId && m.id !== streamingId);
        if (userSaved) out.push(userSaved);
        if (assistantSaved) out.push(assistantSaved);
        return out;
      });
      void accumulated;
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId && m.id !== streamingId));
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setBusy(false);
    }

    function handleStreamEvent(evt: {
      type: string;
      text?: string;
      proposedDraft?: Record<string, unknown> | null;
    }) {
      if (evt.type === 'delta' && typeof evt.text === 'string') {
        setMessages((prev) =>
          prev.map((m) => (m.id === streamingId ? { ...m, content: m.content + evt.text } : m)),
        );
        return;
      }
      if (evt.type === 'done' && evt.proposedDraft) {
        setDraft((prev) => {
          const next = { ...prev, ...evt.proposedDraft };
          onDraftChanged?.(next);
          return next;
        });
      }
    }
  }

  // ---------- Voice input (Web Speech API) ----------
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const voiceSupported =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleVoice() {
    if (!voiceSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec: SpeechRecognitionLike = new (Ctor as unknown as { new (): SpeechRecognitionLike })();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setInput(transcript.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
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
    setResetBusy(true);
    try {
      await api.delete(`/assistant/${stage.id}/history`);
      setMessages([]);
      toast.success('Conversation cleared');
      setResetConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setResetBusy(false);
    }
  }

  const hasDraft = useMemo(() => Object.keys(draft).length > 0, [draft]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-start justify-between px-8 py-5 border-b border-border-default bg-surface">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <stage.icon size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-text-muted uppercase tracking-wide">
                Stage {stage.order}
              </div>
              <StatusPill status={status} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{stage.title}</h1>
            <p className="text-sm text-text-muted mt-0.5">{stage.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            className="btn-secondary"
            onClick={() => setResetConfirmOpen(true)}
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
        <section className="flex flex-col min-h-0 border-r border-border-default bg-app">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
            {!loaded ? (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-surface-muted/70 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-20 rounded bg-surface-muted/70 animate-pulse" />
                    <div className="h-3 w-3/4 rounded bg-surface-muted/70 animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-surface-muted/70 animate-pulse" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-surface-muted/70 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-16 rounded bg-surface-muted/70 animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-surface-muted/70 animate-pulse" />
                  </div>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <OpeningCard stage={stage} />
            ) : (
              messages.map((m) => <ChatBubble key={m.id} message={m} />)
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Sparkles size={14} className="animate-pulse" /> Thinking...
              </div>
            )}
          </div>

          <div className="border-t border-border-default bg-surface px-8 py-4">
            {hasDraft && (
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                <span className="text-xs text-text-muted flex items-center gap-1 mr-1">
                  <Wand2 size={12} /> Refine:
                </span>
                {REFINE_COMMANDS.map((r) => (
                  <button
                    key={r.label}
                    className="text-xs px-2.5 py-1 rounded-full border border-border-default hover:bg-app text-text-secondary"
                    disabled={busy}
                    onClick={() => void send(r.prompt)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                className="input flex-1 resize-none"
                rows={2}
                placeholder={listening ? 'Listening…' : 'Type your reply, or tap the mic to talk...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="flex flex-col gap-1.5 justify-end">
                {voiceSupported && (
                  <button
                    className={`btn-secondary ${listening ? 'bg-red-50 text-red-600 border-red-200' : ''}`}
                    onClick={toggleVoice}
                    title={listening ? 'Stop recording' : 'Dictate'}
                  >
                    <Mic size={14} />
                  </button>
                )}
                <button
                  className="btn-primary"
                  disabled={busy || !input.trim()}
                  onClick={() => void send()}
                >
                  <Send size={14} /> Send
                </button>
              </div>
            </div>
            <div className="text-xs text-text-muted mt-1">
              ⌘/Ctrl + Enter to send. Streaming tokens from the engine. This assistant has all
              previously approved stages in context.
            </div>
          </div>
        </section>

        <section className="flex flex-col min-h-0 bg-surface">
          <div className="px-6 py-4 border-b border-border-default flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Live preview
              </div>
              <div className="text-sm text-text-secondary">
                {hasDraft ? `${Object.keys(draft).length} fields populated` : 'Nothing proposed yet'}
                {version > 0 && <span className="text-text-muted"> · v{version}</span>}
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
              <div className="pt-4 border-t border-border-default">{sidePanel}</div>
            )}
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={(open) => !resetBusy && setResetConfirmOpen(open)}
        title="Clear this conversation?"
        description="The assistant loses its memory for this stage. Your saved drafts and approved data are unaffected."
        confirmLabel="Clear"
        destructive
        loading={resetBusy}
        onConfirm={resetConversation}
      />
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
      <p className="text-text-primary text-base leading-relaxed">“{stage.openingPrompt}”</p>
      <p className="text-sm text-text-muted mt-3">
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
          isUser ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'bg-brand-100 text-brand-700'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block text-sm leading-relaxed rounded-2xl px-4 py-2.5 whitespace-pre-wrap ${
            isUser ? 'bg-slate-700 dark:bg-slate-600 text-white' : 'bg-surface border border-border-default text-text-primary'
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
    locked: 'bg-surface-muted text-text-muted',
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
    <div className="pt-4 border-t border-dashed border-border-default">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">
        Additional assistant output
      </div>
      <pre className="text-xs bg-app rounded-lg p-3 overflow-auto max-h-64">
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
