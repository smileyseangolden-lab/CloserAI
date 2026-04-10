import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  campaignType: string;
  status: string;
  strategy: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  completed: 'bg-slate-100 text-slate-500',
  archived: 'bg-slate-100 text-slate-400',
};

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    void api.get<Campaign[]>('/campaigns').then(setCampaigns);
  }, []);

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Campaigns"
        subtitle="Orchestrate outbound and nurture cadences"
        actions={
          <button className="btn-primary">
            <Plus size={16} />
            New campaign
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {campaigns.map((c) => (
          <Link
            to={`/campaigns/${c.id}`}
            key={c.id}
            className="card p-5 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-slate-900">{c.name}</div>
                <div className="text-xs text-slate-500 mt-0.5 capitalize">
                  {c.campaignType.replace(/_/g, ' ')} • {c.strategy}
                </div>
              </div>
              <span className={`badge ${statusColors[c.status] ?? 'bg-slate-100'}`}>
                {c.status}
              </span>
            </div>
            {c.description && <p className="text-sm text-slate-600">{c.description}</p>}
          </Link>
        ))}
        {campaigns.length === 0 && (
          <div className="col-span-2 card p-12 text-center text-slate-400">
            No campaigns yet. Create your first one to start outbound.
          </div>
        )}
      </div>
    </div>
  );
}
