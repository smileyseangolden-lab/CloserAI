import { useEffect, useState } from 'react';
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

export function AnalyticsPage() {
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignMetric[]>([]);

  useEffect(() => {
    void api.get<FunnelData>('/analytics/funnel').then(setFunnel);
    void api.get<CampaignMetric[]>('/analytics/campaigns').then(setCampaigns);
  }, []);

  const funnelChart = funnel
    ? funnel.stages.map((s) => ({ stage: s, count: funnel.data[s] ?? 0 }))
    : [];

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Analytics"
        subtitle="Funnel performance, campaigns, and conversion trends"
      />

      <div className="card p-6 mb-6">
        <h2 className="font-semibold mb-4">Lead funnel</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3355f0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Campaign performance</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-text-muted border-b border-border-default">
              <th className="text-left py-2">Campaign</th>
              <th className="text-right py-2">Leads</th>
              <th className="text-right py-2">Replied</th>
              <th className="text-right py-2">Warm</th>
              <th className="text-right py-2">Qualified</th>
              <th className="text-right py-2">Converted</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.campaignId} className="border-b border-border-subtle">
                <td className="py-3 font-medium">{c.name}</td>
                <td className="text-right">{c.totalLeads}</td>
                <td className="text-right">{c.replied}</td>
                <td className="text-right">{c.warm}</td>
                <td className="text-right">{c.qualified}</td>
                <td className="text-right">{c.converted}</td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-text-muted py-8">
                  No campaigns yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
