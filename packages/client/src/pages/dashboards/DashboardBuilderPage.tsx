import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  GripVertical,
  Plus,
  Save,
  Trash2,
  BarChart3,
  Target,
  ListChecks,
  AlertTriangle,
  Table,
} from 'lucide-react';
import { api } from '../../api/client';

type WidgetType = 'saved_query' | 'stat_card' | 'stage_progress' | 'anomalies';

interface Widget {
  id: string;
  type: WidgetType;
  title?: string;
  savedQueryId?: string;
  metric?: 'outbound_sent' | 'replies' | 'open_pipeline' | 'won_pipeline';
  size?: 'small' | 'medium' | 'large';
}

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  layout: Widget[];
}

interface SavedQueryRef {
  id: string;
  name: string;
  naturalLanguage: string;
}

const WIDGET_OPTIONS: Array<{ type: WidgetType; label: string; icon: React.ReactNode }> = [
  { type: 'stat_card', label: 'Stat card', icon: <Target size={14} /> },
  { type: 'saved_query', label: 'Saved query table', icon: <Table size={14} /> },
  { type: 'stage_progress', label: 'Stage progress', icon: <ListChecks size={14} /> },
  { type: 'anomalies', label: 'Agent anomalies', icon: <AlertTriangle size={14} /> },
];

export function DashboardBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQueryRef[]>([]);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api
      .get<Dashboard>(`/queries/dashboards/${id}`)
      .then((d) => setDashboard({ ...d, layout: Array.isArray(d.layout) ? d.layout : [] }))
      .catch(() => setDashboard(null));
    void api
      .get<SavedQueryRef[]>('/queries')
      .then(setSavedQueries)
      .catch(() => setSavedQueries([]));
  }, [id]);

  // Refresh live widget data when the layout changes or on mount.
  useEffect(() => {
    if (!dashboard) return;
    setLoadingData(true);
    void api
      .post<{ data: Record<string, unknown> }>(`/queries/dashboards/${dashboard.id}/data`, {})
      .then((r) => setData(r.data))
      .catch(() => setData({}))
      .finally(() => setLoadingData(false));
  }, [dashboard?.id, dashboard?.layout.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const widgetIds = useMemo(() => (dashboard?.layout ?? []).map((w) => w.id), [dashboard]);

  if (!id) return <Navigate to="/stages/analytics" replace />;
  if (dashboard === null) {
    return (
      <div className="p-8 text-slate-500">
        Loading, or dashboard not found.{' '}
        <Link to="/stages/analytics" className="text-brand-600">
          Back to analytics
        </Link>
      </div>
    );
  }

  function onDragEnd(event: DragEndEvent) {
    if (!dashboard) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = dashboard.layout.findIndex((w) => w.id === active.id);
    const newIndex = dashboard.layout.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setDashboard({ ...dashboard, layout: arrayMove(dashboard.layout, oldIndex, newIndex) });
    setDirty(true);
  }

  function addWidget(type: WidgetType) {
    if (!dashboard) return;
    const base: Widget = {
      id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      title: WIDGET_OPTIONS.find((o) => o.type === type)?.label,
      size: 'medium',
    };
    const widget: Widget =
      type === 'stat_card' ? { ...base, metric: 'outbound_sent' } : base;
    setDashboard({ ...dashboard, layout: [...dashboard.layout, widget] });
    setDirty(true);
  }

  function updateWidget(widgetId: string, patch: Partial<Widget>) {
    if (!dashboard) return;
    setDashboard({
      ...dashboard,
      layout: dashboard.layout.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)),
    });
    setDirty(true);
  }

  function removeWidget(widgetId: string) {
    if (!dashboard) return;
    setDashboard({ ...dashboard, layout: dashboard.layout.filter((w) => w.id !== widgetId) });
    setDirty(true);
  }

  async function save() {
    if (!dashboard) return;
    setSaving(true);
    try {
      await api.patch(`/queries/dashboards/${dashboard.id}`, {
        layout: dashboard.layout,
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            to="/stages/analytics"
            className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft size={12} /> Back to Analytics
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-brand-600" />
            <input
              className="text-2xl font-semibold bg-transparent border-none focus:outline-none focus:bg-slate-50 rounded px-1 -ml-1"
              value={dashboard.name}
              onChange={(e) => {
                setDashboard({ ...dashboard, name: e.target.value });
                setDirty(true);
              }}
              onBlur={() => {
                if (dirty) {
                  void api.patch(`/queries/dashboards/${dashboard.id}`, { name: dashboard.name });
                }
              }}
            />
          </div>
          {dashboard.description && (
            <div className="text-sm text-slate-500 mt-1">{dashboard.description}</div>
          )}
        </div>
        <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
          <Save size={14} /> {saving ? 'Saving…' : dirty ? 'Save layout' : 'Saved'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
          <Plus size={12} /> Add:
        </span>
        {WIDGET_OPTIONS.map((o) => (
          <button
            key={o.type}
            className="text-xs px-2.5 py-1 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1"
            onClick={() => addWidget(o.type)}
          >
            {o.icon} {o.label}
          </button>
        ))}
      </div>

      {dashboard.layout.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
          Empty dashboard. Add a widget above.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dashboard.layout.map((widget) => (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  data={data[widget.id]}
                  loading={loadingData}
                  savedQueries={savedQueries}
                  onUpdate={(patch) => updateWidget(widget.id, patch)}
                  onRemove={() => removeWidget(widget.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableWidget({
  widget,
  data,
  loading,
  savedQueries,
  onUpdate,
  onRemove,
}: {
  widget: Widget;
  data: unknown;
  loading: boolean;
  savedQueries: SavedQueryRef[];
  onUpdate: (patch: Partial<Widget>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const span =
    widget.size === 'large'
      ? 'md:col-span-2 lg:col-span-3'
      : widget.size === 'medium'
        ? 'md:col-span-2 lg:col-span-2'
        : '';

  return (
    <div ref={setNodeRef} style={style} className={`card p-4 ${span}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-2 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing mt-0.5"
            aria-label="Drag"
          >
            <GripVertical size={14} />
          </button>
          <div className="min-w-0">
            <input
              className="text-sm font-semibold bg-transparent border-none focus:outline-none focus:bg-slate-50 rounded px-1 -ml-1 w-full"
              value={widget.title ?? ''}
              onChange={(e) => onUpdate({ title: e.target.value })}
            />
            <div className="text-[10px] text-slate-400 uppercase tracking-wide">
              {widget.type.replace(/_/g, ' ')}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <select
            className="text-xs bg-transparent border border-slate-200 rounded px-1.5 py-0.5"
            value={widget.size ?? 'medium'}
            onChange={(e) => onUpdate({ size: e.target.value as Widget['size'] })}
          >
            <option value="small">S</option>
            <option value="medium">M</option>
            <option value="large">L</option>
          </select>
          <button
            onClick={onRemove}
            className="text-slate-300 hover:text-red-500 p-1"
            aria-label="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {widget.type === 'saved_query' && (
        <select
          className="input text-xs mb-3"
          value={widget.savedQueryId ?? ''}
          onChange={(e) => onUpdate({ savedQueryId: e.target.value || undefined })}
        >
          <option value="">— pick a saved query —</option>
          {savedQueries.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
      )}
      {widget.type === 'stat_card' && (
        <select
          className="input text-xs mb-3"
          value={widget.metric ?? 'outbound_sent'}
          onChange={(e) => onUpdate({ metric: e.target.value as Widget['metric'] })}
        >
          <option value="outbound_sent">Outbound sent</option>
          <option value="replies">Replies</option>
          <option value="open_pipeline">Open pipeline</option>
          <option value="won_pipeline">Won pipeline</option>
        </select>
      )}

      <WidgetBody widget={widget} data={data} loading={loading} />
    </div>
  );
}

function WidgetBody({
  widget,
  data,
  loading,
}: {
  widget: Widget;
  data: unknown;
  loading: boolean;
}) {
  if (loading && !data) return <div className="text-xs text-slate-400">Loading…</div>;
  if (!data) return <div className="text-xs text-slate-400">No data yet.</div>;
  const d = data as Record<string, unknown>;
  if (d.error) return <div className="text-xs text-red-600">{String(d.error)}</div>;

  if (widget.type === 'stat_card') {
    const value = (d.value as number | undefined) ?? 0;
    const isCurrency =
      widget.metric === 'open_pipeline' || widget.metric === 'won_pipeline';
    const formatted = isCurrency ? `$${value.toLocaleString()}` : value.toLocaleString();
    return (
      <div>
        <div className="text-3xl font-semibold text-slate-900">{formatted}</div>
        <div className="text-xs text-slate-500 mt-1">{(d.label as string) ?? ''}</div>
      </div>
    );
  }

  if (widget.type === 'saved_query') {
    const rows = (d.rows as Record<string, unknown>[] | undefined) ?? [];
    if (rows.length === 0)
      return (
        <div className="text-xs text-slate-400">{(d.note as string) ?? 'No rows.'}</div>
      );
    const cols = Object.keys(rows[0] ?? {});
    return (
      <div className="overflow-x-auto max-h-56">
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
            {rows.slice(0, 20).map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                {cols.map((c) => (
                  <td key={c} className="py-1 pr-3 text-slate-700">
                    {formatCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.type === 'stage_progress') {
    const stages = (d.stages as Array<{ stageId: string; status: string }> | undefined) ?? [];
    const approved = stages.filter((s) => s.status === 'approved').length;
    const inProg = stages.filter((s) => s.status === 'in_progress').length;
    return (
      <div>
        <div className="text-2xl font-semibold text-slate-900">
          {approved} / 11 approved
        </div>
        <div className="text-xs text-slate-500">
          {inProg} in progress · {11 - approved - inProg} not started
        </div>
        <div className="flex gap-0.5 mt-3 overflow-hidden rounded-full h-1.5 bg-slate-100">
          {Array.from({ length: 11 }).map((_, i) => {
            const s = stages[i];
            return (
              <div
                key={i}
                className={`flex-1 ${
                  s?.status === 'approved'
                    ? 'bg-emerald-500'
                    : s?.status === 'in_progress'
                      ? 'bg-amber-400'
                      : 'bg-slate-200'
                }`}
              />
            );
          })}
        </div>
      </div>
    );
  }

  if (widget.type === 'anomalies') {
    const items =
      (d.items as Array<{ agentName: string; sent: number; replyRate: number }> | undefined) ?? [];
    return (
      <ul className="space-y-1 text-xs">
        {items.length === 0 && <li className="text-slate-400">No qualifying agents.</li>}
        {items.slice(0, 6).map((a) => (
          <li key={a.agentName} className="flex items-center justify-between">
            <span className="truncate">{a.agentName}</span>
            <span className="font-mono text-slate-600">
              {(a.replyRate * 100).toFixed(1)}% · {a.sent} sent
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return <pre className="text-[10px] bg-slate-50 p-2 rounded">{JSON.stringify(d, null, 2)}</pre>;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
