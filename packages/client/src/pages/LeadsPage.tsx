import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, SkeletonRow } from '../components/ui';
import { Plus, Users } from 'lucide-react';

interface Lead {
  id: string;
  companyName: string;
  companyIndustry: string | null;
  companySize: string | null;
  companyLocation: string | null;
  leadScore: number;
  status: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  contacted: 'bg-blue-100 text-blue-700',
  engaging: 'bg-indigo-100 text-indigo-700',
  warm: 'bg-amber-100 text-amber-700',
  hot: 'bg-orange-100 text-orange-700',
  qualified: 'bg-emerald-100 text-emerald-700',
  disqualified: 'bg-red-100 text-red-700',
  converted: 'bg-green-100 text-green-700',
  lost: 'bg-slate-100 text-slate-500',
};

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<{ data: Lead[] }>('/leads?limit=100')
      .then((res) => setLeads(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-7xl">
      <PageHeader
        title="Leads"
        subtitle="All leads in your workspace"
        actions={
          <button className="btn-primary">
            <Plus size={16} />
            Add lead
          </button>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-3 font-medium">Company</th>
              <th className="text-left px-4 py-3 font-medium">Industry</th>
              <th className="text-left px-4 py-3 font-medium">Size</th>
              <th className="text-left px-4 py-3 font-medium">Location</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={6} />)}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Users}
                    title="No leads yet"
                    description="Generate or import leads to start outbound outreach. Your first pass comes from the Data Sources stage."
                    action={
                      <Link to="/stages/data_sources" className="btn-primary">
                        <Plus size={16} /> Generate leads
                      </Link>
                    }
                  />
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/leads/${lead.id}`}
                    className="font-medium text-slate-900 hover:text-brand-600"
                  >
                    {lead.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {lead.companyIndustry ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{lead.companySize ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {lead.companyLocation ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={lead.leadScore} />
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${statusColors[lead.status] ?? 'bg-slate-100'}`}>
                    {lead.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75
      ? 'bg-emerald-100 text-emerald-700'
      : score >= 50
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600';
  return <span className={`badge ${color}`}>{score}</span>;
}
