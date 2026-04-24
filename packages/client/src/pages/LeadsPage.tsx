import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState, Pagination, SkeletonCard, SkeletonRow } from '../components/ui';
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
  new: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  contacted: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  engaging: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  warm: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  hot: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  qualified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  disqualified: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  converted: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  lost: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    const offset = (page - 1) * pageSize;
    void api
      .get<{ data: Lead[]; total: number }>(`/leads?limit=${pageSize}&offset=${offset}`)
      .then((res) => {
        setLeads(res.data);
        setTotal(res.total ?? res.data.length);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  if (!loading && leads.length === 0 && total === 0) {
    return (
      <div className="p-4 md:p-8 max-w-7xl">
        <PageHeader title="Leads" subtitle="All leads in your workspace" />
        <div className="card">
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
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl">
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

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-3">
        {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        {!loading &&
          leads.map((lead) => (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="card p-4 flex flex-col gap-2 hover:border-brand-400 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-text-primary truncate">
                    {lead.companyName}
                  </div>
                  <div className="text-xs text-text-muted truncate">
                    {lead.companyIndustry ?? '—'} · {lead.companySize ?? 'size n/a'}
                  </div>
                </div>
                <ScoreBadge score={lead.leadScore} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted truncate">
                  {lead.companyLocation ?? ''}
                </span>
                <span className={`badge ${statusColors[lead.status] ?? 'bg-slate-100'}`}>
                  {lead.status}
                </span>
              </div>
            </Link>
          ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-muted/60 border-b border-border-default">
            <tr className="text-xs uppercase text-text-muted">
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
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-border-subtle hover:bg-surface-muted/50"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/leads/${lead.id}`}
                    className="font-medium text-text-primary hover:text-brand-600 dark:hover:text-brand-300"
                  >
                    {lead.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {lead.companyIndustry ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {lead.companySize ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
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

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : score >= 50
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  return <span className={`badge ${color}`}>{score}</span>;
}
