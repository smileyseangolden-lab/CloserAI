import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Megaphone } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Pagination,
  Select,
  SkeletonCard,
  Textarea,
  toast,
} from '../components/ui';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  campaignType: string;
  status: string;
  strategy: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  completed: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  archived: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
};

const CAMPAIGN_TYPES: Array<{ value: string; label: string }> = [
  { value: 'outbound_cold', label: 'Outbound cold' },
  { value: 'nurture_warm', label: 'Nurture warm' },
  { value: 're_engagement', label: 'Re-engagement' },
  { value: 'event_follow_up', label: 'Event follow-up' },
  { value: 'closing', label: 'Closing' },
  { value: 'custom', label: 'Custom' },
];

const CAMPAIGN_STRATEGIES: Array<{ value: string; label: string }> = [
  { value: 'educational', label: 'Educational' },
  { value: 'direct', label: 'Direct' },
  { value: 'social_proof', label: 'Social proof' },
  { value: 'pain_point', label: 'Pain point' },
  { value: 'challenger', label: 'Challenger' },
  { value: 'value_first', label: 'Value first' },
];

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    const offset = (page - 1) * pageSize;
    void api
      .get<{ data: Campaign[]; total: number }>(
        `/campaigns?limit=${pageSize}&offset=${offset}`,
      )
      .then((r) => {
        setCampaigns(r.data);
        setTotal(r.total ?? r.data.length);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <PageHeader
        title="Campaigns"
        subtitle="Orchestrate outbound and nurture cadences"
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            New campaign
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description="Campaigns bundle your cadence, agents, and target ICP into an orchestrated outbound flow."
            action={
              <>
                <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> New campaign
                </button>
                <Link to="/stages/agent-builder" className="btn-secondary">
                  Design in Agent Builder
                </Link>
              </>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {campaigns.map((c) => (
            <Link
              to={`/campaigns/${c.id}`}
              key={c.id}
              className="card p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-text-primary">{c.name}</div>
                  <div className="text-xs text-text-muted mt-0.5 capitalize">
                    {c.campaignType.replace(/_/g, ' ')} • {c.strategy}
                  </div>
                </div>
                <span className={`badge ${statusColors[c.status] ?? 'bg-slate-100'}`}>
                  {c.status}
                </span>
              </div>
              {c.description && <p className="text-sm text-text-secondary">{c.description}</p>}
            </Link>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="mt-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  campaignType: z.enum([
    'outbound_cold',
    'nurture_warm',
    're_engagement',
    'event_follow_up',
    'closing',
    'custom',
  ]),
  strategy: z.enum([
    'educational',
    'direct',
    'social_proof',
    'pain_point',
    'challenger',
    'value_first',
  ]),
  description: z.string().trim().max(2000).optional(),
});

type CampaignCreateValues = z.infer<typeof campaignCreateSchema>;

function CreateCampaignDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<CampaignCreateValues>({
    resolver: zodResolver(campaignCreateSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      campaignType: 'outbound_cold',
      strategy: 'educational',
      description: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        campaignType: values.campaignType,
        strategy: values.strategy,
      };
      if (values.description?.trim()) payload.description = values.description.trim();
      const created = await api.post<{ id: string }>('/campaigns', payload);
      toast.success('Campaign created');
      onCreated();
      onOpenChange(false);
      reset();
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create campaign');
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>
              Create a campaign draft. You can attach agents, ICP, and a cadence after.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field>
              <FieldLabel htmlFor="c-name">Name</FieldLabel>
              <Input
                id="c-name"
                autoFocus
                placeholder="Q2 outbound — VP Sales"
                aria-invalid={errors.name ? 'true' : 'false'}
                {...register('name')}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="c-type">Type</FieldLabel>
                <Select id="c-type" options={CAMPAIGN_TYPES} {...register('campaignType')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-strategy">Strategy</FieldLabel>
                <Select
                  id="c-strategy"
                  options={CAMPAIGN_STRATEGIES}
                  {...register('strategy')}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="c-description">Description (optional)</FieldLabel>
              <Textarea
                id="c-description"
                rows={3}
                placeholder="What's this campaign trying to accomplish?"
                {...register('description')}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={!isValid}>
              Create campaign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
