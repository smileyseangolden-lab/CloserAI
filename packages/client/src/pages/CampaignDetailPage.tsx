import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  Activity,
  BarChart3,
  ListOrdered,
  Mail,
  Pause,
  Play,
  Workflow,
} from 'lucide-react';
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

interface CadenceStep {
  id: string;
  stepNumber: number;
  channel: string;
  delayDays: number;
  delayHours: number;
  subjectTemplate: string | null;
  bodyTemplate: string;
  aiPersonalizationEnabled: boolean;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  strategy: string;
  campaignType: string;
  steps: CadenceStep[];
}

interface CampaignActivity {
  id: string;
  activityType: string;
  description: string;
  createdAt: string;
}

export function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [activities, setActivities] = useState<CampaignActivity[]>([]);

  useEffect(() => {
    if (!id) return;
    void api.get<Campaign>(`/campaigns/${id}`).then(setCampaign);
    void api
      .get<CampaignActivity[]>(`/activities?campaignId=${id}`)
      .then(setActivities)
      .catch(() => setActivities([]));
  }, [id]);

  async function toggle() {
    if (!campaign || !id) return;
    const path = campaign.status === 'active' ? 'pause' : 'start';
    try {
      const updated = await api.post<Campaign>(`/campaigns/${id}/${path}`);
      setCampaign({ ...campaign, status: updated.status });
      toast.success(
        updated.status === 'active' ? 'Campaign started' : 'Campaign paused',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update campaign');
    }
  }

  if (!campaign) {
    return <LoadingBlock label="Loading campaign…" className="min-h-[60vh]" />;
  }

  const canStart = campaign.status !== 'active';
  const messages = activities.filter((a) =>
    /email|message|reply|sms|linkedin|send/i.test(a.activityType),
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.campaignType.replace(/_/g, ' ')} • ${campaign.strategy}`}
        actions={
          <button
            className={canStart ? 'btn-primary' : 'btn-secondary'}
            onClick={toggle}
          >
            {canStart ? <Play size={16} /> : <Pause size={16} />}
            {canStart ? 'Start campaign' : 'Pause'}
          </button>
        }
      />

      <div className="card p-4 md:p-6">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              <Workflow size={14} /> Overview
            </TabsTrigger>
            <TabsTrigger value="cadence">
              <ListOrdered size={14} /> Cadence
              {campaign.steps.length > 0 && (
                <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                  {campaign.steps.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="messages">
              <Mail size={14} /> Messages
              {messages.length > 0 && (
                <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                  {messages.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity size={14} /> Activity
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 size={14} /> Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard
                label="Status"
                value={campaign.status.replace(/_/g, ' ')}
              />
              <SummaryCard label="Strategy" value={campaign.strategy} />
              <SummaryCard label="Type" value={campaign.campaignType.replace(/_/g, ' ')} />
            </div>
            {campaign.description && (
              <div className="mt-6">
                <div className="label">Description</div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">
                  {campaign.description}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cadence">
            {campaign.steps.length === 0 ? (
              <EmptyState
                compact
                icon={ListOrdered}
                title="No cadence steps yet"
                description="Add steps to define how this campaign sequences outreach over time."
              />
            ) : (
              <div className="space-y-4">
                {campaign.steps.map((step) => (
                  <div
                    key={step.id}
                    className="border border-border-default rounded-xl p-4 flex gap-4"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-semibold dark:bg-brand-500/15 dark:text-brand-300">
                      {step.stepNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="badge bg-surface-muted text-text-primary capitalize">
                          {step.channel.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-text-muted">
                          Wait {step.delayDays}d {step.delayHours}h
                        </span>
                        {step.aiPersonalizationEnabled && (
                          <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                            AI personalized
                          </span>
                        )}
                      </div>
                      {step.subjectTemplate && (
                        <div className="text-sm font-medium mb-1 text-text-primary">
                          Subject: {step.subjectTemplate}
                        </div>
                      )}
                      <div className="text-sm text-text-secondary whitespace-pre-wrap">
                        {step.bodyTemplate}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="messages">
            {messages.length === 0 ? (
              <EmptyState
                compact
                icon={Mail}
                title="No messages yet"
                description="Sends, opens, replies, and bounces will appear here as the cadence runs."
              />
            ) : (
              <Timeline items={activitiesToTimeline(messages)} />
            )}
          </TabsContent>

          <TabsContent value="activity">
            {activities.length === 0 ? (
              <EmptyState
                compact
                icon={Activity}
                title="No activity yet"
                description="Pauses, resumes, compliance events, and other campaign-level signals will show up here."
              />
            ) : (
              <Timeline items={activitiesToTimeline(activities)} />
            )}
          </TabsContent>

          <TabsContent value="analytics">
            <EmptyState
              compact
              icon={BarChart3}
              title="Analytics coming soon"
              description="Send, open, reply, and conversion funnels per step are planned for the next iteration. The cross-campaign view lives in Analytics."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-default p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-text-primary capitalize">{value}</div>
    </div>
  );
}

function activitiesToTimeline(activities: CampaignActivity[]): TimelineItem[] {
  return activities.map((a) => ({
    id: a.id,
    title: prettyLabel(a.activityType),
    description: a.description,
    timestamp: a.createdAt,
    tone: inferTone(a.activityType),
  }));
}

function prettyLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferTone(type: string): TimelineItem['tone'] {
  if (/reply|won|converted|qualified|resume|start/i.test(type)) return 'positive';
  if (/bounce|fail|error|kill|block|pause/i.test(type)) return 'critical';
  if (/warn|risk/i.test(type)) return 'warning';
  if (/sent|created|opened|clicked|enqueued/i.test(type)) return 'brand';
  return 'neutral';
}
