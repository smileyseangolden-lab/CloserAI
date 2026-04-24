import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Activity, Mail, MessageSquare, StickyNote, User2 } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import {
  EmptyState,
  LoadingBlock,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Timeline,
  type TimelineItem,
  toast,
} from '../components/ui';

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  seniorityLevel: string | null;
}

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
  contacts: Contact[];
}

interface Activity {
  id: string;
  activityType: string;
  description: string;
  createdAt: string;
}

export function LeadDetailPage() {
  const { id } = useParams();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (!id) return;
    void api.get<LeadDetail>(`/leads/${id}`).then(setLead);
    void api
      .get<Activity[]>(`/activities?leadId=${id}`)
      .then(setActivities)
      .catch(() => setActivities([]));
  }, [id]);

  async function rescore() {
    if (!id) return;
    try {
      const result = await api.post<{ leadScore: number }>(`/leads/${id}/score`);
      if (lead) setLead({ ...lead, leadScore: result.leadScore });
      toast.success(`Rescored — ${result.leadScore}/100`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rescore failed');
    }
  }

  if (!lead) return <LoadingBlock label="Loading lead…" className="min-h-[60vh]" />;

  const messages = activities.filter((a) =>
    /email|message|reply|sms|linkedin/i.test(a.activityType),
  );
  const otherActivity = activities.filter((a) => !messages.includes(a));

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title={lead.companyName}
        subtitle={`${lead.companyIndustry ?? 'Unknown industry'} • ${
          lead.companyLocation ?? '—'
        }`}
        actions={
          <button className="btn-secondary" onClick={rescore}>
            Re-score lead
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-4 md:p-6">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">
                <User2 size={14} /> Overview
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Activity size={14} /> Activity
                {activities.length > 0 && (
                  <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                    {activities.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="messages">
                <MessageSquare size={14} /> Messages
                {messages.length > 0 && (
                  <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                    {messages.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="notes">
                <StickyNote size={14} /> Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <h2 className="font-semibold mb-4 text-text-primary">Contacts</h2>
              {lead.contacts.length === 0 ? (
                <EmptyState
                  compact
                  icon={User2}
                  title="No contacts yet"
                  description="Contacts will appear once the enrichment step runs for this lead."
                />
              ) : (
                <div className="space-y-3">
                  {lead.contacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border-subtle"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-text-primary truncate">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="text-sm text-text-muted truncate">
                          {c.jobTitle ?? '—'}
                          {c.seniorityLevel && ` • ${c.seniorityLevel}`}
                        </div>
                      </div>
                      <div className="text-sm text-text-secondary truncate min-w-0 max-w-[50%]">
                        {c.email}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity">
              {otherActivity.length === 0 ? (
                <EmptyState
                  compact
                  icon={Activity}
                  title="No activity yet"
                  description="Status changes, enrichment runs, and other events will appear here."
                />
              ) : (
                <Timeline items={activitiesToTimeline(otherActivity)} />
              )}
            </TabsContent>

            <TabsContent value="messages">
              {messages.length === 0 ? (
                <EmptyState
                  compact
                  icon={Mail}
                  title="No messages yet"
                  description="Outbound emails, replies, and LinkedIn DMs will show up here."
                />
              ) : (
                <Timeline items={activitiesToTimeline(messages)} />
              )}
            </TabsContent>

            <TabsContent value="notes">
              <EmptyState
                compact
                icon={StickyNote}
                title="Notes coming soon"
                description="Free-form notes on a lead are planned for the next iteration."
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold mb-2 text-text-primary">Lead score</h2>
            <div className="text-5xl font-semibold text-brand-600 dark:text-brand-300">
              {lead.leadScore}
            </div>
            <div className="text-xs text-text-muted mb-4">out of 100</div>
            {lead.leadScoreBreakdown && (
              <div className="space-y-2 text-sm">
                {Object.entries(lead.leadScoreBreakdown)
                  .filter(([k]) => k !== 'total')
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-text-secondary capitalize">{k}</span>
                      <span className="font-medium text-text-primary">{v}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-2 text-text-primary">Details</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-text-muted">Website</dt>
                <dd className="text-text-primary">{lead.companyWebsite ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Size</dt>
                <dd className="text-text-primary">{lead.companySize ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Status</dt>
                <dd className="text-text-primary">{lead.status}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function activitiesToTimeline(activities: Activity[]): TimelineItem[] {
  return activities.map((a) => {
    const tone = inferTone(a.activityType);
    return {
      id: a.id,
      title: prettyLabel(a.activityType),
      description: a.description,
      timestamp: a.createdAt,
      tone,
    };
  });
}

function prettyLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferTone(type: string): TimelineItem['tone'] {
  if (/reply|won|converted|qualified/i.test(type)) return 'positive';
  if (/bounce|fail|error|dnc|disqualified/i.test(type)) return 'critical';
  if (/warn|risk/i.test(type)) return 'warning';
  if (/sent|created|opened|clicked/i.test(type)) return 'brand';
  return 'neutral';
}
