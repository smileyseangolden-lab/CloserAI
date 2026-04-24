import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Megaphone } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, SkeletonCard } from '../components/ui';

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
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  completed: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  archived: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Campaign[]>('/campaigns')
      .then(setCampaigns)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-7xl">
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

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Campaigns bundle your cadence, agents, and target ICP into an orchestrated outbound flow."
            action={
              <Link to="/stages/agent_builder" className="btn-primary">
                <Plus size={16} /> Create a campaign
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map((c) => (
            <Link
              to={`/campaigns/${c.id}`}
              key={c.id}
              className="card p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-text-primary">{c.name}</div>
                  <div className="text-xs text-text-muted mt-0.5 capitalize">
                    {c.campaignType.replace(/_/g, ' ')} • {c.strategy}
                  </div>
                </div>
                <span className={`badge ${statusColors[c.status] ?? 'bg-slate-100'}`}>
                  {c.status}
                </span>
              </div>
              {c.description && <p className="text-sm text-text-secondary">{c.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
