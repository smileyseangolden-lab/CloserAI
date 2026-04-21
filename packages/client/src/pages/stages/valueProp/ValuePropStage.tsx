import { useEffect, useState } from 'react';
import { Sparkles, DollarSign, Swords } from 'lucide-react';
import { api } from '../../../api/client';
import { StepAssistant } from '../../../components/assistant/StepAssistant';
import { STAGE_BY_ID } from '../../../workflow/stages';

interface ValuePropRow {
  id: string;
  variant: 'technical' | 'business_outcome' | 'emotional';
  headline: string;
  body: string;
  proofPoints: string[] | null;
  targetPersona: string | null;
}

interface PricingRow {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: string | null;
  priceAnnual: string | null;
  currency: string;
  features: string[] | null;
  targetSegment: string | null;
  sortOrder: number;
}

interface CompetitorRow {
  id: string;
  competitor: string;
  competitorUrl: string | null;
  ourStrengths: string[] | null;
  theirStrengths: string[] | null;
  differentiators: string[] | null;
  pricingNotes: string | null;
  g2Rating: number | null;
}

export function ValuePropStage() {
  const stage = STAGE_BY_ID['value-prop']!;
  const [variants, setVariants] = useState<ValuePropRow[]>([]);
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void Promise.all([
      api.get<ValuePropRow[]>('/value-props'),
      api.get<PricingRow[]>('/value-props/pricing'),
      api.get<CompetitorRow[]>('/value-props/competitors'),
    ])
      .then(([v, p, c]) => {
        setVariants(v);
        setPricing(p.sort((a, b) => a.sortOrder - b.sortOrder));
        setCompetitors(c);
      })
      .catch(() => undefined);
  }, [refreshKey]);

  return (
    <StepAssistant
      key={`vp-${refreshKey}`}
      stage={stage}
      onApproved={() => setRefreshKey((k) => k + 1)}
      sidePanel={
        <div className="space-y-4">
          <Section
            icon={<Sparkles size={12} />}
            title="Pitch variants · value_props"
            empty={variants.length === 0}
            emptyHint="Approve the draft to write three variants here."
          >
            {variants.map((v) => (
              <div
                key={v.id}
                className="bg-white rounded-lg border border-slate-200 p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="badge bg-brand-50 text-brand-700 capitalize">
                    {v.variant.replace(/_/g, ' ')}
                  </span>
                  {v.targetPersona && (
                    <span className="text-xs text-slate-500">{v.targetPersona}</span>
                  )}
                </div>
                <div className="font-medium text-slate-900">{v.headline}</div>
                <div className="text-sm text-slate-700 line-clamp-3">{v.body}</div>
                {v.proofPoints && v.proofPoints.length > 0 && (
                  <ul className="text-xs text-slate-600 list-disc pl-4">
                    {v.proofPoints.slice(0, 3).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>

          <Section
            icon={<DollarSign size={12} />}
            title="Pricing tiers · pricing_tiers"
            empty={pricing.length === 0}
            emptyHint="Once approved, tiers appear here ordered by sortOrder."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pricing.map((p) => (
                <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{p.name}</div>
                  {p.priceMonthly && (
                    <div className="text-lg font-semibold text-slate-900">
                      {p.currency} {Number(p.priceMonthly).toLocaleString()}
                      <span className="text-xs font-normal text-slate-500">/mo</span>
                    </div>
                  )}
                  {p.targetSegment && (
                    <div className="text-xs text-slate-500 mb-1">{p.targetSegment}</div>
                  )}
                  {p.features && p.features.length > 0 && (
                    <ul className="text-xs text-slate-700 list-disc pl-4">
                      {p.features.slice(0, 4).map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                      {p.features.length > 4 && (
                        <li className="text-slate-400">+{p.features.length - 4} more</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section
            icon={<Swords size={12} />}
            title="Competitive matrix · competitive_matrix"
            empty={competitors.length === 0}
            emptyHint="Ask the assistant to research a competitor (it can web_fetch G2 for you)."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1 pr-3">Competitor</th>
                    <th className="text-left py-1 pr-3">G2</th>
                    <th className="text-left py-1 pr-3">Where we win</th>
                    <th className="text-left py-1">Where they win</th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-900">{c.competitor}</div>
                        {c.competitorUrl && (
                          <a
                            href={c.competitorUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-600 text-xs"
                          >
                            visit
                          </a>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {c.g2Rating ? `${c.g2Rating.toFixed(1)}★` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {(c.ourStrengths ?? []).slice(0, 3).join(' · ') || '—'}
                      </td>
                      <td className="py-2 text-slate-700">
                        {(c.theirStrengths ?? []).slice(0, 3).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      }
    />
  );
}

function Section({
  icon,
  title,
  empty,
  emptyHint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty: boolean;
  emptyHint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
        {icon} {title}
      </div>
      {empty ? <div className="text-xs text-slate-400">{emptyHint}</div> : children}
    </div>
  );
}
