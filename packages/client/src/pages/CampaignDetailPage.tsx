import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Play, Pause } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingBlock } from '../components/ui';

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

export function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.get<Campaign>(`/campaigns/${id}`).then(setCampaign);
  }, [id]);

  async function toggle() {
    if (!campaign || !id) return;
    const path = campaign.status === 'active' ? 'pause' : 'start';
    const updated = await api.post<Campaign>(`/campaigns/${id}/${path}`);
    setCampaign({ ...campaign, status: updated.status });
  }

  if (!campaign) return <LoadingBlock label="Loading campaign…" className="min-h-[60vh]" />;

  const canStart = campaign.status !== 'active';

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title={campaign.name}
        subtitle={`${campaign.campaignType.replace(/_/g, ' ')} • ${campaign.strategy}`}
        actions={
          <button className={canStart ? 'btn-primary' : 'btn-secondary'} onClick={toggle}>
            {canStart ? <Play size={16} /> : <Pause size={16} />}
            {canStart ? 'Start campaign' : 'Pause'}
          </button>
        }
      />

      <div className="card p-6 mb-6">
        <h2 className="font-semibold mb-4">Cadence</h2>
        <div className="space-y-4">
          {campaign.steps.map((step) => (
            <div
              key={step.id}
              className="border border-border-default rounded-xl p-4 flex gap-4"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-semibold">
                {step.stepNumber}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge bg-surface-muted text-text-primary capitalize">
                    {step.channel.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-text-muted">
                    Wait {step.delayDays}d {step.delayHours}h
                  </span>
                  {step.aiPersonalizationEnabled && (
                    <span className="badge bg-brand-50 text-brand-700">AI personalized</span>
                  )}
                </div>
                {step.subjectTemplate && (
                  <div className="text-sm font-medium mb-1">Subject: {step.subjectTemplate}</div>
                )}
                <div className="text-sm text-text-secondary whitespace-pre-wrap">
                  {step.bodyTemplate}
                </div>
              </div>
            </div>
          ))}
          {campaign.steps.length === 0 && (
            <div className="text-sm text-text-muted">No cadence steps yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
