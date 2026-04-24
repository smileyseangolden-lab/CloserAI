import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Bot } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, SkeletonCard } from '../components/ui';

interface Agent {
  id: string;
  name: string;
  agentType: string;
  personalityStyle: string;
  senderName: string;
  senderTitle: string | null;
  isActive: boolean;
}

const typeColors: Record<string, string> = {
  prospector: 'bg-blue-100 text-blue-700',
  nurturer: 'bg-amber-100 text-amber-700',
  closer: 'bg-emerald-100 text-emerald-700',
  hybrid: 'bg-indigo-100 text-indigo-700',
};

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Agent[]>('/agents')
      .then(setAgents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Agents"
        subtitle="AI personalities that handle your outreach and closing"
        actions={
          <button className="btn-primary">
            <Plus size={16} />
            New agent
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Build your first AI persona. The Agent Builder stage walks you through tone, personality, and sender identity."
            action={
              <Link to="/stages/agent_builder" className="btn-primary">
                <Plus size={16} /> Build an agent
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <Link
              to={`/agents/${a.id}`}
              key={a.id}
              className="card p-5 hover:shadow-md transition"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center">
                  <Bot size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{a.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {a.senderName}
                    {a.senderTitle && `, ${a.senderTitle}`}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <span className={`badge ${typeColors[a.agentType] ?? 'bg-slate-100'}`}>
                      {a.agentType}
                    </span>
                    <span className="badge bg-slate-100 text-slate-600 capitalize">
                      {a.personalityStyle.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
