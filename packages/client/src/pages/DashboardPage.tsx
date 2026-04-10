import { useEffect, useState } from 'react';
import { Users, Megaphone, Target, Mail } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { AnthropicKeyBanner } from '../components/AnthropicKeyBanner';

interface DashboardData {
  leads: { total: number; newCount: number; warmCount: number; hotCount: number; qualifiedCount: number; convertedCount: number };
  campaigns: { total: number; activeCount: number };
  opportunities: { total: number; openValue: number; wonValue: number; wonCount: number };
  messages: { sent: number; replied: number };
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void api.get<DashboardData>('/analytics/dashboard').then(setData).catch(() => setData(null));
  }, []);

  const leads = data?.leads;
  const opps = data?.opportunities;

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your pipeline, campaigns, and outreach."
      />

      <AnthropicKeyBanner />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total leads"
          value={leads?.total ?? 0}
          change={`${leads?.warmCount ?? 0} warm, ${leads?.hotCount ?? 0} hot`}
          icon={Users}
        />
        <StatCard
          label="Active campaigns"
          value={data?.campaigns.activeCount ?? 0}
          change={`${data?.campaigns.total ?? 0} total`}
          icon={Megaphone}
        />
        <StatCard
          label="Open pipeline"
          value={`$${Number(opps?.openValue ?? 0).toLocaleString()}`}
          change={`${opps?.total ?? 0} opportunities`}
          icon={Target}
        />
        <StatCard
          label="Messages sent"
          value={data?.messages.sent ?? 0}
          change={`${data?.messages.replied ?? 0} replies`}
          icon={Mail}
        />
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Funnel</h2>
        <FunnelBars
          stages={[
            { label: 'New', value: leads?.newCount ?? 0 },
            { label: 'Engaging', value: 0 },
            { label: 'Warm', value: leads?.warmCount ?? 0 },
            { label: 'Hot', value: leads?.hotCount ?? 0 },
            { label: 'Qualified', value: leads?.qualifiedCount ?? 0 },
            { label: 'Converted', value: leads?.convertedCount ?? 0 },
          ]}
        />
      </div>
    </div>
  );
}

function FunnelBars({ stages }: { stages: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <div key={s.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-600">{s.label}</span>
            <span className="font-medium">{s.value}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${(s.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
