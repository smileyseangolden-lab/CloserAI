import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import {
  EmptyState,
  Pagination,
  Select,
  Skeleton,
  type SelectOption,
} from '../components/ui';
import { useTheme } from '../lib/theme';
import { BarChart3 } from 'lucide-react';

interface FunnelData {
  stages: string[];
  data: Record<string, number>;
}

interface CampaignMetric {
  campaignId: string;
  name: string;
  totalLeads: number;
  replied: number;
  warm: number;
  qualified: number;
  converted: number;
}

interface CampaignChoice {
  id: string;
  name: string;
}

const RANGE_OPTIONS: SelectOption[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
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

function prettyStage(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AnalyticsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [range, setRange] = useState('30');
  const [campaignChoices, setCampaignChoices] = useState<CampaignChoice[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(true);

  const [campaigns, setCampaigns] = useState<CampaignMetric[] | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  // Load the campaign list once for the filter dropdown.
  useEffect(() => {
    void api
      .get<{ data: CampaignChoice[] }>('/campaigns?limit=200')
      .then((r) => setCampaignChoices(r.data ?? []))
      .catch(() => setCampaignChoices([]));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [range, campaignFilter, pageSize]);

  // Funnel
  useEffect(() => {
    const { from, to } = rangeToDates(range);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    setFunnelLoading(true);
    void api
      .get<FunnelData>(`/analytics/funnel${qs ? `?${qs}` : ''}`)
      .then((r) => setFunnel(r))
      .catch(() => setFunnel(null))
      .finally(() => setFunnelLoading(false));
  }, [range]);

  // Campaign performance
  useEffect(() => {
    const { from, to } = rangeToDates(range);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (campaignFilter !== 'all') params.set('campaignId', campaignFilter);
    params.set('limit', String(pageSize));
    params.set('offset', String((page - 1) * pageSize));

    setCampaignsLoading(true);
    void api
      .get<{ data: CampaignMetric[]; total: number }>(
        `/analytics/campaigns?${params.toString()}`,
      )
      .then((r) => {
        setCampaigns(r.data ?? []);
        setTotal(r.total ?? r.data?.length ?? 0);
      })
      .catch(() => setCampaigns([]))
      .finally(() => setCampaignsLoading(false));
  }, [range, campaignFilter, page, pageSize]);

  const funnelChart = useMemo(
    () =>
      funnel
        ? funnel.stages.map((s) => ({
            stage: prettyStage(s),
            count: funnel.data[s] ?? 0,
          }))
        : [],
    [funnel],
  );

  const campaignOptions: SelectOption[] = useMemo(
    () => [
      { value: 'all', label: 'All campaigns' },
      ...campaignChoices.map((c) => ({ value: c.id, label: c.name })),
    ],
    [campaignChoices],
  );

  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const barColor = isDark ? '#5a7bff' : '#3355f0';
  const tooltipBg = isDark ? '#0f172a' : '#ffffff';
  const tooltipBorder = isDark ? '#1e293b' : '#e2e8f0';
  const tooltipText = isDark ? '#f1f5f9' : '#0f172a';

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <PageHeader
        title="Analytics"
        subtitle="Funnel performance, campaigns, and conversion trends"
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
            <div className="w-[220px] max-w-[50vw]">
              <Select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                options={campaignOptions}
                aria-label="Campaign"
              />
            </div>
          </div>
        }
      />

      <div className="card p-4 md:p-6 mb-6">
        <h2 className="font-semibold mb-4 text-text-primary">Lead funnel</h2>
        <div className="h-64">
          {funnelLoading ? (
            <FunnelSkeleton />
          ) : !funnel || funnelChart.every((d) => d.count === 0) ? (
            <EmptyState
              compact
              icon={BarChart3}
              title="No data in this range"
              description="Try widening the date range, or wait until leads enter the funnel."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="stage" tick={{ fontSize: 12, fill: axisColor }} />
                <YAxis tick={{ fontSize: 12, fill: axisColor }} />
                <Tooltip
                  cursor={{ fill: gridColor, fillOpacity: 0.3 }}
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: 8,
                    color: tooltipText,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: tooltipText, fontWeight: 500 }}
                />
                <Bar dataKey="count" fill={barColor} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card p-4 md:p-6">
        <h2 className="font-semibold mb-4 text-text-primary">Campaign performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-text-muted border-b border-border-default">
                <th className="text-left py-2 pr-2">Campaign</th>
                <th className="text-right py-2 px-2">Leads</th>
                <th className="text-right py-2 px-2">Replied</th>
                <th className="text-right py-2 px-2">Warm</th>
                <th className="text-right py-2 px-2">Qualified</th>
                <th className="text-right py-2 pl-2">Converted</th>
              </tr>
            </thead>
            <tbody>
              {campaignsLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-subtle">
                    <td className="py-3 pr-2">
                      <Skeleton className="h-3 w-40" />
                    </td>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="py-3 px-2 text-right">
                        <Skeleton className="h-3 w-8 ml-auto" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!campaignsLoading &&
                campaigns?.map((c) => (
                  <tr
                    key={c.campaignId}
                    className="border-b border-border-subtle text-text-primary"
                  >
                    <td className="py-3 pr-2 font-medium">{c.name}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{c.totalLeads}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{c.replied}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{c.warm}</td>
                    <td className="text-right py-3 px-2 tabular-nums">{c.qualified}</td>
                    <td className="text-right py-3 pl-2 tabular-nums">{c.converted}</td>
                  </tr>
                ))}
              {!campaignsLoading && campaigns && campaigns.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8">
                    <EmptyState
                      compact
                      icon={BarChart3}
                      title="No campaigns match these filters"
                      description="Try a different range or campaign, or create one to start driving activity."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
      </div>
    </div>
  );
}

function FunnelSkeleton() {
  return (
    <div className="h-full w-full flex items-end gap-3 pt-6 pb-1 px-2">
      {[0.45, 0.75, 0.6, 0.85, 0.35, 0.55, 0.65].map((h, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-md rounded-b-none"
          style={{ height: `${h * 100}%` }}
        />
      ))}
    </div>
  );
}
