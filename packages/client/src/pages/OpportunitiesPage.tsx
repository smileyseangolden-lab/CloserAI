import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, Target } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  LoadingBlock,
  Select,
  Textarea,
  Timeline,
  toast,
  type TimelineItem,
} from '../components/ui';

interface Opportunity {
  id: string;
  title: string;
  description: string | null;
  stage: string;
  estimatedValue: string | null;
  probability: number;
  expectedCloseDate: string | null;
  leadId?: string | null;
  currency?: string | null;
}

interface StageHistoryRow {
  id: string;
  fromStage: string | null;
  toStage: string;
  notes: string | null;
  createdAt: string;
}

interface OpportunityDetail extends Opportunity {
  description: string | null;
  history: StageHistoryRow[];
}

const STAGES: Array<{ key: string; label: string }> = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'verbal_commit', label: 'Verbal' },
  { key: 'closed_won', label: 'Won' },
];

const ALL_STAGES: Array<{ value: string; label: string }> = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'verbal_commit', label: 'Verbal commit' },
  { value: 'closed_won', label: 'Closed — won' },
  { value: 'closed_lost', label: 'Closed — lost' },
];

const stageTone: Record<string, TimelineItem['tone']> = {
  discovery: 'neutral',
  qualification: 'brand',
  proposal: 'brand',
  negotiation: 'warning',
  verbal_commit: 'warning',
  closed_won: 'positive',
  closed_lost: 'critical',
};

function formatCurrency(value: string | number | null | undefined, currency = 'USD') {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n.toLocaleString()}`;
  }
}

function prettyStage(stage: string) {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void api
      .get<Opportunity[]>('/opportunities')
      .then(setOpps)
      .catch(() => setOpps([]));
  }, [refreshKey]);

  if (opps === null) return <LoadingBlock label="Loading pipeline…" />;

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <PageHeader title="Pipeline" subtitle="Deal kanban board" />

      {opps.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Target}
            title="No opportunities yet"
            description="Opportunities are created automatically when a lead qualifies, or by the closing agent. You can also add one manually via the API."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-max pb-4">
            {STAGES.map((stage) => {
              const stageOpps = opps.filter((o) => o.stage === stage.key);
              const total = stageOpps.reduce(
                (sum, o) => sum + Number(o.estimatedValue ?? 0),
                0,
              );
              return (
                <div key={stage.key} className="w-72 flex-shrink-0">
                  <div className="card">
                    <div className="p-3 border-b border-border-default flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm text-text-primary">
                          {stage.label}
                        </div>
                        <div className="text-xs text-text-muted">
                          {stageOpps.length} · {formatCurrency(total)}
                        </div>
                      </div>
                    </div>
                    <div className="p-2 space-y-2 min-h-[400px]">
                      {stageOpps.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setOpenId(o.id)}
                          className="w-full text-left p-3 rounded-lg border border-border-subtle bg-surface hover:shadow-sm hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 transition"
                        >
                          <div className="font-medium text-sm text-text-primary mb-1">
                            {o.title}
                          </div>
                          <div className="flex items-center justify-between text-xs text-text-muted">
                            <span>{formatCurrency(o.estimatedValue, o.currency ?? 'USD')}</span>
                            <span>{o.probability}%</span>
                          </div>
                        </button>
                      ))}
                      {stageOpps.length === 0 && (
                        <div className="text-xs text-text-muted text-center py-4">Empty</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <OpportunityDialog
        id={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

function OpportunityDialog({
  id,
  onClose,
  onChanged,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingStage, setPendingStage] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setPendingStage('');
      setNotes('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api
      .get<OpportunityDetail>(`/opportunities/${id}`)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setPendingStage(d.stage);
      })
      .catch((err) => {
        if (!cancelled)
          toast.error(err instanceof Error ? err.message : 'Could not load opportunity');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveStage() {
    if (!detail) return;
    setSaving(true);
    try {
      await api.post(`/opportunities/${detail.id}/stage`, {
        stage: pendingStage,
        notes: notes.trim() || undefined,
      });
      toast.success(`Moved to ${prettyStage(pendingStage)}`);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update stage');
    } finally {
      setSaving(false);
    }
  }

  const historyItems: TimelineItem[] =
    detail?.history.map((h) => ({
      id: h.id,
      title: (
        <>
          {h.fromStage ? prettyStage(h.fromStage) : 'Created'}{' '}
          <span className="text-text-muted">→</span> {prettyStage(h.toStage)}
        </>
      ),
      description: h.notes ?? undefined,
      timestamp: h.createdAt,
      tone: stageTone[h.toStage] ?? 'neutral',
    })) ?? [];

  const dirty = detail ? pendingStage !== detail.stage || notes.trim().length > 0 : false;

  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[min(94vw,42rem)]">
        {loading || !detail ? (
          <div className="p-6">
            <LoadingBlock label="Loading opportunity…" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription>
                {formatCurrency(detail.estimatedValue, detail.currency ?? 'USD')} ·{' '}
                {detail.probability}% · currently{' '}
                <strong className="text-text-primary">{prettyStage(detail.stage)}</strong>
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              {detail.description && (
                <p className="text-sm text-text-secondary whitespace-pre-wrap">
                  {detail.description}
                </p>
              )}

              {detail.leadId && (
                <Link
                  to={`/leads/${detail.leadId}`}
                  className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-300 hover:underline"
                >
                  Open lead <ExternalLink size={12} />
                </Link>
              )}

              <section>
                <div className="label mb-2">Move to stage</div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <Select
                    options={ALL_STAGES}
                    value={pendingStage}
                    onChange={(e) => setPendingStage(e.target.value)}
                    aria-label="Stage"
                  />
                </div>
                <Textarea
                  className="mt-2"
                  rows={2}
                  placeholder="Note for the audit log (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </section>

              {historyItems.length > 0 && (
                <section>
                  <div className="label mb-3">Stage history</div>
                  <Timeline items={historyItems} />
                </section>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Close
              </Button>
              <Button
                onClick={() => void saveStage()}
                loading={saving}
                disabled={!dirty || saving}
              >
                Save stage change
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
