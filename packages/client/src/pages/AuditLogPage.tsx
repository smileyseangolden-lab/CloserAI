import { useEffect, useMemo, useState } from 'react';
import { FileClock, Info } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import {
  EmptyState,
  Pagination,
  Select,
  Skeleton,
  type SelectOption,
} from '../components/ui';

interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  userId: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
}

interface AuditMeta {
  resourceTypes: string[];
  actions: string[];
}

const RANGE_OPTIONS: SelectOption[] = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function rangeToDates(range: string): { from?: string; to?: string } {
  if (range === 'all') return {};
  const days = Number(range);
  if (!Number.isFinite(days)) return {};
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatActor(r: AuditRow) {
  const name = [r.userFirstName, r.userLastName].filter(Boolean).join(' ');
  if (name) return name;
  if (r.userEmail) return r.userEmail;
  if (r.userId) return 'User';
  return 'System';
}

function formatTimestamp(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function AuditLogPage() {
  const [range, setRange] = useState('7');
  const [resourceType, setResourceType] = useState('all');
  const [action, setAction] = useState('all');

  const [meta, setMeta] = useState<AuditMeta | null>(null);

  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<AuditMeta>('/audit/meta')
      .then(setMeta)
      .catch(() => setMeta({ resourceTypes: [], actions: [] }));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [range, resourceType, action, pageSize]);

  useEffect(() => {
    const { from, to } = rangeToDates(range);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (resourceType !== 'all') params.set('resourceType', resourceType);
    if (action !== 'all') params.set('action', action);
    params.set('limit', String(pageSize));
    params.set('offset', String((page - 1) * pageSize));

    setLoading(true);
    void api
      .get<{ data: AuditRow[]; total: number }>(`/audit?${params.toString()}`)
      .then((r) => {
        setRows(r.data ?? []);
        setTotal(r.total ?? r.data?.length ?? 0);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [range, resourceType, action, page, pageSize]);

  const resourceOptions: SelectOption[] = useMemo(
    () => [
      { value: 'all', label: 'All resource types' },
      ...(meta?.resourceTypes ?? []).map((r) => ({ value: r, label: r })),
    ],
    [meta],
  );

  const actionOptions: SelectOption[] = useMemo(
    () => [
      { value: 'all', label: 'All actions' },
      ...(meta?.actions ?? []).map((a) => ({ value: a, label: a })),
    ],
    [meta],
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title="Audit log"
        subtitle="Admin-only view of significant actions across your workspace."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[180px]">
              <Select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                options={RANGE_OPTIONS}
                aria-label="Date range"
              />
            </div>
            <div className="w-[200px]">
              <Select
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                options={resourceOptions}
                aria-label="Resource type"
              />
            </div>
            <div className="w-[180px]">
              <Select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                options={actionOptions}
                aria-label="Action"
              />
            </div>
          </div>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted/60 border-b border-border-default text-xs uppercase text-text-muted">
                <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">
                  When
                </th>
                <th className="text-left px-4 py-2.5 font-medium">Actor</th>
                <th className="text-left px-4 py-2.5 font-medium">Action</th>
                <th className="text-left px-4 py-2.5 font-medium">Resource</th>
                <th className="text-left px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-subtle">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-3 w-full max-w-[160px]" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                rows?.map((r) => {
                  const hasChanges =
                    r.changes !== null &&
                    typeof r.changes === 'object' &&
                    Object.keys(r.changes).length > 0;
                  const expanded = expandedId === r.id;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border-subtle text-text-primary align-top"
                    >
                      <td className="px-4 py-3 text-text-muted whitespace-nowrap tabular-nums">
                        <time
                          dateTime={new Date(r.createdAt).toISOString()}
                          title={new Date(r.createdAt).toLocaleString()}
                        >
                          {formatTimestamp(r.createdAt)}
                        </time>
                      </td>
                      <td className="px-4 py-3">{formatActor(r)}</td>
                      <td className="px-4 py-3 font-medium">{r.action}</td>
                      <td className="px-4 py-3">
                        <div>{r.resourceType}</div>
                        {r.resourceId && (
                          <div className="text-[11px] font-mono text-text-muted truncate max-w-[220px]">
                            {r.resourceId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {hasChanges ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(expanded ? null : r.id)
                              }
                              className="text-xs text-brand-600 dark:text-brand-300 hover:underline"
                            >
                              {expanded ? 'Hide' : 'Show'} diff
                            </button>
                            {expanded && (
                              <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-app border border-border-default p-2 text-[11px] text-text-secondary whitespace-pre-wrap">
                                {JSON.stringify(r.changes, null, 2)}
                              </pre>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                        {r.ipAddress && (
                          <div className="mt-1 text-[10px] text-text-muted">
                            IP {r.ipAddress}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {!loading && rows && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10">
                    <EmptyState
                      compact
                      icon={FileClock}
                      title="No audit events match these filters"
                      description="Try widening the range or clearing the resource/action filters. If you just enabled audit logging, events will start appearing as they happen."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs text-text-muted max-w-2xl">
        <Info size={12} className="mt-0.5 flex-shrink-0" />
        <span>
          The audit log schema captures <code>action</code>, <code>resourceType</code>,{' '}
          <code>resourceId</code>, a free-form <code>changes</code> diff, actor user, IP, and
          timestamp. Writers are added incrementally as each module gains auditing; if a
          feature doesn't appear here yet, it just hasn't been instrumented.
        </span>
      </p>
    </div>
  );
}
