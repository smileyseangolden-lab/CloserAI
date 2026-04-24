import { useEffect, useState } from 'react';
import { Globe2, Check } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface BusinessProfile {
  id: string;
  companyName: string;
  industry: string | null;
  subIndustry: string | null;
  website: string | null;
  valueProposition: string | null;
  keyDifferentiators: string[] | null;
  targetVerticals: string[] | null;
  painPointsSolved: string[] | null;
  annualRevenueRange: string | null;
  aiGeneratedSummary: string | null;
  updatedAt: string;
}

interface AssistantMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export function CompanyProfileStage() {
  const stage = STAGE_BY_ID['company-profile']!;
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [websiteInput, setWebsiteInput] = useState('');
  const [kicking, setKicking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void api
      .get<BusinessProfile | null>('/profiles')
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [refreshKey]);

  async function kickoffFromWebsite() {
    const url = websiteInput.trim();
    if (!url) return;
    setKicking(true);
    try {
      await api.post<AssistantMessageRow>(`/assistant/${stage.id}/chat`, {
        message: `My website is ${url}. Please fetch it now with web_fetch, then (where possible) also pull my LinkedIn company page and Crunchbase profile, and propose a full company_profile draft. Ask me only about gaps you can't infer.`,
      });
      setWebsiteInput('');
      // Bump the assistant's history by triggering a remount of StepAssistant.
      // We key the component so it re-fetches messages.
      setRefreshKey((k) => k + 1);
    } finally {
      setKicking(false);
    }
  }

  return (
    <StepAssistant
      key={`profile-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      headerActions={
        <div className="flex items-center gap-2">
          <input
            className="input w-64 h-9"
            placeholder="https://yourcompany.com"
            value={websiteInput}
            onChange={(e) => setWebsiteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void kickoffFromWebsite();
              }
            }}
          />
          <button
            className="btn-secondary"
            onClick={kickoffFromWebsite}
            disabled={kicking || !websiteInput.trim()}
            title="Hand the URL to the Profile assistant so it can research you"
          >
            <Globe2 size={14} /> {kicking ? 'Starting…' : 'Analyse site'}
          </button>
        </div>
      }
      sidePanel={<CanonicalProfilePanel profile={profile} />}
    />
  );
}

function CanonicalProfilePanel({ profile }: { profile: BusinessProfile | null }) {
  if (!profile) {
    return (
      <div className="rounded-xl border border-dashed border-border-default p-4 text-sm text-text-muted">
        <div className="font-medium text-text-primary mb-1">Canonical profile</div>
        Nothing persisted yet. Approve the draft above and I’ll write it to{' '}
        <code className="text-xs bg-surface-muted px-1.5 py-0.5 rounded">business_profiles</code>.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 uppercase tracking-wide mb-2">
        <Check size={12} /> Approved · business_profiles
      </div>
      <div className="text-base font-semibold text-text-primary">{profile.companyName}</div>
      <div className="text-xs text-text-muted mb-2">
        {[profile.industry, profile.subIndustry, profile.annualRevenueRange]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {profile.aiGeneratedSummary && (
        <p className="text-sm text-text-primary mb-2">{profile.aiGeneratedSummary}</p>
      )}
      {profile.valueProposition && (
        <div className="text-sm mb-2">
          <span className="font-medium text-text-primary">Value prop: </span>
          {profile.valueProposition}
        </div>
      )}
      {profile.keyDifferentiators && profile.keyDifferentiators.length > 0 && (
        <div className="text-sm mb-2">
          <div className="font-medium text-text-primary mb-1">Differentiators</div>
          <ul className="list-disc pl-5 text-text-primary">
            {profile.keyDifferentiators.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {profile.targetVerticals && profile.targetVerticals.length > 0 && (
        <div className="text-sm mb-2">
          <div className="font-medium text-text-primary mb-1">Target verticals</div>
          <div className="flex flex-wrap gap-1">
            {profile.targetVerticals.map((v, i) => (
              <span key={i} className="badge bg-surface-muted text-text-primary">
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
