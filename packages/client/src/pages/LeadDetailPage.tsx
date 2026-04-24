import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingBlock } from '../components/ui';

interface LeadDetail {
  id: string;
  companyName: string;
  companyWebsite: string | null;
  companyIndustry: string | null;
  companySize: string | null;
  companyLocation: string | null;
  leadScore: number;
  leadScoreBreakdown: Record<string, number> | null;
  status: string;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    jobTitle: string | null;
    seniorityLevel: string | null;
  }>;
}

export function LeadDetailPage() {
  const { id } = useParams();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<
    Array<{ id: string; activityType: string; description: string; createdAt: string }>
  >([]);

  useEffect(() => {
    if (!id) return;
    void api.get<LeadDetail>(`/leads/${id}`).then(setLead);
    void api
      .get<typeof activities>(`/activities?leadId=${id}`)
      .then(setActivities)
      .catch(() => setActivities([]));
  }, [id]);

  async function rescore() {
    if (!id) return;
    const result = await api.post<{ leadScore: number }>(`/leads/${id}/score`);
    if (lead) setLead({ ...lead, leadScore: result.leadScore });
  }

  if (!lead) return <LoadingBlock label="Loading lead…" className="min-h-[60vh]" />;

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title={lead.companyName}
        subtitle={`${lead.companyIndustry ?? 'Unknown industry'} • ${lead.companyLocation ?? '—'}`}
        actions={
          <button className="btn-secondary" onClick={rescore}>
            Re-score lead
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Contacts</h2>
            <div className="space-y-3">
              {lead.contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border-subtle"
                >
                  <div>
                    <div className="font-medium">
                      {c.firstName} {c.lastName}
                    </div>
                    <div className="text-sm text-text-muted">
                      {c.jobTitle ?? '—'}
                      {c.seniorityLevel && ` • ${c.seniorityLevel}`}
                    </div>
                  </div>
                  <div className="text-sm text-text-secondary">{c.email}</div>
                </div>
              ))}
              {lead.contacts.length === 0 && (
                <div className="text-sm text-text-muted">No contacts yet.</div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Activity timeline</h2>
            <div className="space-y-3">
              {activities.length === 0 && (
                <div className="text-sm text-text-muted">No activity yet.</div>
              )}
              {activities.map((a) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 mt-2 rounded-full bg-brand-500" />
                  <div className="flex-1">
                    <div className="font-medium">{a.activityType}</div>
                    <div className="text-text-muted">{a.description}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold mb-2">Lead score</h2>
            <div className="text-5xl font-semibold text-brand-600">{lead.leadScore}</div>
            <div className="text-xs text-text-muted mb-4">out of 100</div>
            {lead.leadScoreBreakdown && (
              <div className="space-y-2 text-sm">
                {Object.entries(lead.leadScoreBreakdown)
                  .filter(([k]) => k !== 'total')
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-text-secondary capitalize">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-2">Details</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-text-muted">Website</dt>
                <dd>{lead.companyWebsite ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Size</dt>
                <dd>{lead.companySize ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Status</dt>
                <dd>{lead.status}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
