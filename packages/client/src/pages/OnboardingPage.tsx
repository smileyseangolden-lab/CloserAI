import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { api } from '../api/client';
import {
  Button,
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  FormError,
  Input,
  Textarea,
  toast,
} from '../components/ui';
import { useLocalStorageState } from '../lib/useLocalStorageState';

const DRAFT_KEY = 'closerai.onboarding.draft';

const step1Schema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  website: z
    .string()
    .trim()
    .min(1, 'Website is required')
    .refine(
      (v) => /^https?:\/\/[^\s]+$/i.test(v),
      'Enter a full URL starting with http:// or https://',
    ),
});

type Step1Values = z.infer<typeof step1Schema>;

const step2Schema = z.object({
  companySummary: z.string().trim().min(10, 'Add at least a sentence of summary'),
  valueProposition: z.string().trim().min(1, 'Value proposition is required'),
});

type Step2Values = z.infer<typeof step2Schema>;

interface AnalysisResult {
  companySummary?: string;
  valueProposition?: string;
  keyDifferentiators?: string[];
  suggestedIcps?: Array<{ name: string; description: string }>;
}

interface Draft {
  step: 1 | 2;
  step1: Step1Values;
  step2?: Step2Values;
  analysis?: AnalysisResult;
}

const emptyDraft: Draft = {
  step: 1,
  step1: { companyName: '', website: '' },
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const [draft, setDraft, clearDraft] = useLocalStorageState<Draft>(DRAFT_KEY, emptyDraft);
  const [analyzing, setAnalyzing] = useState(false);

  const step1Form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    mode: 'onChange',
    defaultValues: draft.step1,
  });

  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    mode: 'onChange',
    defaultValues: draft.step2 ?? {
      companySummary: draft.analysis?.companySummary ?? '',
      valueProposition: draft.analysis?.valueProposition ?? '',
    },
  });

  // Persist every keystroke so a refresh doesn't lose the user's work.
  useEffect(() => {
    const sub = step1Form.watch((values) => {
      setDraft((d) => ({
        ...d,
        step1: {
          companyName: values.companyName ?? '',
          website: values.website ?? '',
        },
      }));
    });
    return () => sub.unsubscribe();
  }, [step1Form, setDraft]);

  useEffect(() => {
    const sub = step2Form.watch((values) => {
      setDraft((d) => ({
        ...d,
        step2: {
          companySummary: values.companySummary ?? '',
          valueProposition: values.valueProposition ?? '',
        },
      }));
    });
    return () => sub.unsubscribe();
  }, [step2Form, setDraft]);

  const runAnalysis = step1Form.handleSubmit(async (values) => {
    setAnalyzing(true);
    try {
      const result = await api.post<AnalysisResult>('/profiles/analyze', {
        websiteUrl: values.website,
      });
      setDraft((d) => ({
        ...d,
        step: 2,
        analysis: result,
        step2: {
          companySummary: result.companySummary ?? '',
          valueProposition: result.valueProposition ?? '',
        },
      }));
      step2Form.reset({
        companySummary: result.companySummary ?? '',
        valueProposition: result.valueProposition ?? '',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Website analysis failed');
    } finally {
      setAnalyzing(false);
    }
  });

  const completeOnboarding = step2Form.handleSubmit(() => {
    clearDraft();
    navigate('/dashboard');
  });

  const goBack = () => {
    setDraft((d) => ({ ...d, step: 1 }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-app">
      <div className="w-full max-w-2xl card p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2 flex-1 mr-4">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= draft.step ? 'bg-brand-500' : 'bg-surface-muted'
                }`}
              />
            ))}
          </div>
          <DraftBadge />
        </div>

        {draft.step === 1 && (
          <form onSubmit={runAnalysis} noValidate>
            <h1 className="text-2xl font-semibold mb-2 text-text-primary">
              Tell us about your business
            </h1>
            <p className="text-sm text-text-muted mb-6">
              We will analyze your website to bootstrap your business profile and ICP
              suggestions.
            </p>
            <div className="space-y-4">
              <Field>
                <FieldLabel htmlFor="companyName">Company name</FieldLabel>
                <Input
                  id="companyName"
                  aria-invalid={step1Form.formState.errors.companyName ? 'true' : 'false'}
                  {...step1Form.register('companyName')}
                />
                <FieldError>{step1Form.formState.errors.companyName?.message}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="website">Website</FieldLabel>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://example.com"
                  aria-invalid={step1Form.formState.errors.website ? 'true' : 'false'}
                  {...step1Form.register('website')}
                />
                <FieldError>{step1Form.formState.errors.website?.message}</FieldError>
                <FieldHint>We only read public pages — no auth required.</FieldHint>
              </Field>
              <FormError>{step1Form.formState.errors.root?.message}</FormError>
              <Button
                type="submit"
                className="w-full justify-center"
                size="lg"
                loading={analyzing}
                disabled={!step1Form.formState.isValid || analyzing}
              >
                {analyzing ? (
                  <>Analyzing with Claude…</>
                ) : (
                  <>Analyze</>
                )}
              </Button>
            </div>
          </form>
        )}

        {draft.step === 2 && (
          <form onSubmit={completeOnboarding} noValidate>
            <h1 className="text-2xl font-semibold mb-2 text-text-primary">
              Here is what we found
            </h1>
            <p className="text-sm text-text-muted mb-6">
              Review and edit before we create your initial profile and ICPs.
            </p>
            <div className="space-y-4 mb-6">
              <Field>
                <FieldLabel htmlFor="companySummary">Summary</FieldLabel>
                <Textarea
                  id="companySummary"
                  rows={4}
                  aria-invalid={
                    step2Form.formState.errors.companySummary ? 'true' : 'false'
                  }
                  {...step2Form.register('companySummary')}
                />
                <FieldError>
                  {step2Form.formState.errors.companySummary?.message}
                </FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="valueProposition">Value proposition</FieldLabel>
                <Input
                  id="valueProposition"
                  aria-invalid={
                    step2Form.formState.errors.valueProposition ? 'true' : 'false'
                  }
                  {...step2Form.register('valueProposition')}
                />
                <FieldError>
                  {step2Form.formState.errors.valueProposition?.message}
                </FieldError>
              </Field>
              {draft.analysis?.suggestedIcps && draft.analysis.suggestedIcps.length > 0 && (
                <Field>
                  <FieldLabel>Suggested ICPs</FieldLabel>
                  <div className="space-y-2">
                    {draft.analysis.suggestedIcps.map((icp, i) => (
                      <div
                        key={i}
                        className="border border-border-default rounded-lg p-3 bg-surface-muted/40"
                      >
                        <div className="font-medium text-text-primary">{icp.name}</div>
                        <div className="text-sm text-text-secondary">{icp.description}</div>
                      </div>
                    ))}
                  </div>
                </Field>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={goBack}
                disabled={analyzing}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 justify-center"
                size="lg"
                disabled={!step2Form.formState.isValid}
              >
                Looks good — continue
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function DraftBadge() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <span
      className={`flex items-center gap-1 text-[11px] font-medium text-text-muted transition-opacity ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-live="polite"
    >
      <Save size={12} />
      Draft saved
    </span>
  );
}

