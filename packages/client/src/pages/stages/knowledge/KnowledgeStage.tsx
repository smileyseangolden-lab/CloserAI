import { useEffect, useState } from 'react';
import { BookOpen, Globe2, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

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
  const [busy, setBusy] = useState<'paste' | 'url' | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);

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

  async function remove(id: string) {
    if (!confirm('Delete this knowledge entry?')) return;
    await api.delete(`/knowledge/${id}`);
    setRefreshKey((k) => k + 1);
  }

  async function runSearch() {
    if (!searchQ.trim()) return setHits(null);
    const r = await api.post<SearchHit[]>('/knowledge/search', { q: searchQ.trim() });
    setHits(r);
  }

  return (
    <StepAssistant
      key={`kn-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
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
            <div className="border-t border-slate-200 pt-3">
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
              <div className="text-xs text-slate-400 mt-1">
                Strips HTML and embeds the first ~20k chars.
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
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
                  <div className="text-xs text-slate-400">No hits.</div>
                )}
                {hits.map((h) => (
                  <div
                    key={h.id}
                    className="text-xs bg-slate-50 rounded px-2.5 py-1.5 border border-slate-200"
                  >
                    <div className="font-medium text-slate-800">{h.title}</div>
                    <div className="text-slate-600 line-clamp-2">{h.content}</div>
                    {h.similarity !== null && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        sim {(h.similarity * 100).toFixed(0)}% · {h.source}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              <BookOpen size={12} /> Library · {entries.length} entries
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {entries.length === 0 && (
                <div className="text-xs text-slate-400">Empty. Add entries above.</div>
              )}
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between bg-white rounded-lg border border-slate-200 p-2.5"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-slate-100 text-slate-600 text-[10px] capitalize">
                        {e.source.replace(/_/g, ' ')}
                      </span>
                      {e.embeddedAt ? (
                        <span className="text-[10px] text-emerald-600">embedded</span>
                      ) : (
                        <span className="text-[10px] text-amber-600">no vector</span>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">{e.title}</div>
                    <div className="text-xs text-slate-500 line-clamp-1">{e.content}</div>
                  </div>
                  <button
                    onClick={() => remove(e.id)}
                    className="text-slate-300 hover:text-red-500 p-1"
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
  );
}
