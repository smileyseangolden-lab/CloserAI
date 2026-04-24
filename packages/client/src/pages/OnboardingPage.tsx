import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { toast } from '../components/ui';

export function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{
    companySummary?: string;
    valueProposition?: string;
    keyDifferentiators?: string[];
    suggestedIcps?: Array<{ name: string; description: string }>;
  } | null>(null);
  const navigate = useNavigate();

  async function runAnalysis() {
    if (!website) return;
    setAnalyzing(true);
    try {
      const result = await api.post<typeof analysis>('/profiles/analyze', { websiteUrl: website });
      setAnalysis(result);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Website analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl card p-8">
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-brand-500' : 'bg-slate-200'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <>
            <h1 className="text-2xl font-semibold mb-2">Tell us about your business</h1>
            <p className="text-sm text-slate-500 mb-6">
              We will analyze your website to bootstrap your business profile and ICP suggestions.
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Company name</label>
                <input
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Website</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://..."
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <button
                className="btn-primary w-full justify-center"
                onClick={runAnalysis}
                disabled={analyzing || !website}
              >
                {analyzing ? 'Analyzing with Claude...' : 'Analyze'}
              </button>
            </div>
          </>
        )}

        {step === 2 && analysis && (
          <>
            <h1 className="text-2xl font-semibold mb-2">Here is what we found</h1>
            <p className="text-sm text-slate-500 mb-6">
              Review and edit before we create your initial profile and ICPs.
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="label">Summary</label>
                <textarea className="input" rows={3} defaultValue={analysis.companySummary} />
              </div>
              <div>
                <label className="label">Value proposition</label>
                <input className="input" defaultValue={analysis.valueProposition} />
              </div>
              {analysis.suggestedIcps && (
                <div>
                  <label className="label">Suggested ICPs</label>
                  <div className="space-y-2">
                    {analysis.suggestedIcps.map((icp, i) => (
                      <div key={i} className="border border-slate-200 rounded-lg p-3">
                        <div className="font-medium">{icp.name}</div>
                        <div className="text-sm text-slate-600">{icp.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="btn-primary flex-1 justify-center"
                onClick={() => navigate('/dashboard')}
              >
                Looks good — continue
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
