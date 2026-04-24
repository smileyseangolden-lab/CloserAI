import { useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, Globe2, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';
import { ConfirmDialog, toast } from '../../../components/ui';

interface KnowledgeRow {
  id: string;
  source: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  embeddingModel: string | null;
  embeddedAt: string | null;
  updatedAt: string;
}

interface SearchHit {
  id: string;
  title: string;
  source: string;
  content: string;
  similarity: number | null;
}

export function KnowledgeStage() {
  const stage = STAGE_BY_ID['knowledge']!;
  const [entries, setEntries] = useState<KnowledgeRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState<'paste' | 'url' | 'pdf' | 'auto' | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [autoResult, setAutoResult] = useState<{ count: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [autoConfirmOpen, setAutoConfirmOpen] = useState(false);

  useEffect(() => {
    void api
      .get<KnowledgeRow[]>('/knowledge')
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [refreshKey]);

  async function ingestPaste() {
    if (!pasteTitle.trim() || !pasteContent.trim()) return;
    setBusy('paste');
    try {
      await api.post('/knowledge', {
        source: 'pasted',
        title: pasteTitle.trim(),
        content: pasteContent.trim(),
      });
      setPasteTitle('');
      setPasteContent('');
      setRefreshKey((k) => k + 1);
    } finally {
      setBusy(null);
    }
  }

  async function ingestUrl() {
    if (!urlInput.trim()) return;
    setBusy('url');
    try {
      await api.post('/knowledge/ingest-url', { url: urlInput.trim() });
      setUrlInput('');
      setRefreshKey((k) => k + 1);
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/knowledge/${deleteTarget.id}`);
      toast.success('Knowledge entry removed');
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function runSearch() {
    if (!searchQ.trim()) return setHits(null);
    const r = await api.post<SearchHit[]>('/knowledge/search', { q: searchQ.trim() });
    setHits(r);
  }

  async function uploadPdf(file: File) {
    setBusy('pdf');
    try {
      const base64 = await fileToBase64(file);
      await api.post('/knowledge/upload-pdf', {
        filename: file.name,
        base64,
      });
      toast.success(`${file.name} uploaded`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  async function confirmAutoGenerate() {
    setBusy('auto');
    setAutoResult(null);
    setAutoConfirmOpen(false);
    try {
      const r = await api.post<{ count: number }>('/knowledge/auto-generate', {});
      setAutoResult(r);
      toast.success(`Generated ${r.count} knowledge entries`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
    <StepAssistant
      key={`kn-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
              <Upload size={12} /> Add to library
            </div>
            <div className="space-y-2 mb-3">
              <input
                className="input text-sm"
                placeholder="Title (e.g. Pricing FAQ)"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
              <textarea
                className="input text-sm font-mono"
                rows={4}
                placeholder="Paste raw text — battlecard, FAQ, transcript snippet..."
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
              />
              <button
                className="btn-primary w-full justify-center"
                onClick={ingestPaste}
                disabled={busy === 'paste' || !pasteTitle.trim() || !pasteContent.trim()}
              >
                {busy === 'paste' ? 'Embedding…' : 'Add pasted entry'}
              </button>
            </div>
            <div className="border-t border-border-default pt-3 space-y-3">
              <div>
                <div className="flex gap-2">
                  <input
                    className="input text-sm flex-1"
                    placeholder="https://your-help-center/article"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />
                  <button
                    className="btn-secondary"
                    onClick={ingestUrl}
                    disabled={busy === 'url' || !urlInput.trim()}
                  >
                    <Globe2 size={12} /> Fetch
                  </button>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  Strips HTML and embeds the first ~20k chars.
                </div>
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPdf(f);
                    e.target.value = '';
                  }}
                />
                <button
                  className="btn-secondary w-full justify-center"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy === 'pdf'}
                >
                  <FileText size={12} /> {busy === 'pdf' ? 'Parsing…' : 'Upload PDF'}
                </button>
                <div className="text-xs text-text-muted mt-1">
                  PDFs are chunked, embedded, and searchable immediately.
                </div>
              </div>
              <div>
                <button
                  className="btn-primary w-full justify-center"
                  onClick={() => setAutoConfirmOpen(true)}
                  disabled={busy === 'auto'}
                >
                  <Sparkles size={12} />{' '}
                  {busy === 'auto' ? 'Generating…' : 'Auto-generate battlecards + FAQs + playbooks'}
                </button>
                {autoResult && (
                  <div className="text-xs text-emerald-700 mt-1">
                    Generated {autoResult.count} entries from your profile + value props.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
              <Search size={12} /> Search RAG index
            </div>
            <div className="flex gap-2">
              <input
                className="input text-sm flex-1"
                placeholder="What does the assistant retrieve for ‘pricing objection’?"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
              />
              <button className="btn-secondary" onClick={runSearch} disabled={!searchQ.trim()}>
                Search
              </button>
            </div>
            {hits && (
              <div className="mt-3 space-y-1.5">
                {hits.length === 0 && (
                  <div className="text-xs text-text-muted">No hits.</div>
                )}
                {hits.map((h) => (
                  <div
                    key={h.id}
                    className="text-xs bg-surface-muted rounded px-2.5 py-1.5 border border-border-default"
                  >
                    <div className="font-medium text-text-primary">{h.title}</div>
                    <div className="text-text-secondary line-clamp-2">{h.content}</div>
                    {h.similarity !== null && (
                      <div className="text-[10px] text-text-muted mt-0.5">
                        sim {(h.similarity * 100).toFixed(0)}% · {h.source}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border-default p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
              <BookOpen size={12} /> Library · {entries.length} entries
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {entries.length === 0 && (
                <div className="text-xs text-text-muted">Empty. Add entries above.</div>
              )}
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between bg-surface rounded-lg border border-border-default p-2.5"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-surface-muted text-text-secondary text-[10px] capitalize">
                        {e.source.replace(/_/g, ' ')}
                      </span>
                      {e.embeddedAt ? (
                        <span className="text-[10px] text-emerald-600">embedded</span>
                      ) : (
                        <span className="text-[10px] text-amber-600">no vector</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">{e.title}</div>
                    <div className="text-xs text-text-muted line-clamp-1">{e.content}</div>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(e)}
                    className="text-text-muted hover:text-red-500 p-1"
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
    <ConfirmDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}
      title="Delete knowledge entry?"
      description={
        deleteTarget ? (
          <>
            This will permanently remove <strong>{deleteTarget.title}</strong> from your
            knowledge base.
          </>
        ) : null
      }
      confirmLabel="Delete"
      destructive
      loading={deleteBusy}
      onConfirm={confirmDelete}
    />
    <ConfirmDialog
      open={autoConfirmOpen}
      onOpenChange={setAutoConfirmOpen}
      title="Auto-generate knowledge?"
      description="Seeds battlecards, FAQs, and objection playbooks from your approved profile + value props. You can review and edit everything afterwards."
      confirmLabel="Generate"
      onConfirm={confirmAutoGenerate}
    />
    </>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error('Unexpected reader result'));
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}
