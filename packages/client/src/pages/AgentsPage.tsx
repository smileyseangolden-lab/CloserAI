import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Bot } from 'lucide-react';
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
  FieldHint,
  FieldLabel,
  Input,
  Pagination,
  Select,
  SkeletonCard,
  toast,
} from '../components/ui';

interface Agent {
  id: string;
  name: string;
  agentType: string;
  personalityStyle: string;
  senderName: string;
  senderTitle: string | null;
  isActive: boolean;
}

const typeColors: Record<string, string> = {
  prospector: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  nurturer: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  closer: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  hybrid: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
};

const AGENT_TYPES = [
  { value: 'prospector', label: 'Prospector' },
  { value: 'nurturer', label: 'Nurturer' },
  { value: 'closer', label: 'Closer' },
  { value: 'hybrid', label: 'Hybrid' },
];

const PERSONALITY_STYLES = [
  { value: 'technical', label: 'Technical' },
  { value: 'consultative', label: 'Consultative' },
  { value: 'social_friendly', label: 'Social & friendly' },
  { value: 'executive', label: 'Executive' },
  { value: 'challenger', label: 'Challenger' },
  { value: 'educational', label: 'Educational' },
];

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
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
      .get<{ data: Agent[]; total: number }>(`/agents?limit=${pageSize}&offset=${offset}`)
      .then((r) => {
        setAgents(r.data);
        setTotal(r.total ?? r.data.length);
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  return (
    <div className="p-4 md:p-8 max-w-6xl">
      <PageHeader
        title="Agents"
        subtitle="AI personalities that handle your outreach and closing"
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            New agent
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Spin up an AI persona with a name and tone. The Agent Builder stage lets you go deeper with system prompts, writing examples, and escalation rules."
            action={
              <>
                <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> New agent
                </button>
                <Link to="/stages/agent-builder" className="btn-secondary">
                  Open Agent Builder
                </Link>
              </>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <Link
              to={`/agents/${a.id}`}
              key={a.id}
              className="card p-5 hover:shadow-md transition"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center dark:bg-brand-500/15 dark:text-brand-300">
                  <Bot size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-text-primary">{a.name}</div>
                  <div className="text-xs text-text-muted truncate">
                    {a.senderName}
                    {a.senderTitle && `, ${a.senderTitle}`}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <span className={`badge ${typeColors[a.agentType] ?? 'bg-slate-100'}`}>
                      {a.agentType}
                    </span>
                    <span className="badge bg-surface-muted text-text-secondary capitalize">
                      {a.personalityStyle.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
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

      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}

const agentCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  agentType: z.enum(['prospector', 'nurturer', 'closer', 'hybrid']),
  personalityStyle: z.enum([
    'technical',
    'consultative',
    'social_friendly',
    'executive',
    'challenger',
    'educational',
  ]),
  senderName: z.string().trim().min(1, 'Sender name is required'),
  senderTitle: z.string().trim().optional(),
});

type AgentCreateValues = z.infer<typeof agentCreateSchema>;

function CreateAgentDialog({
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
  } = useForm<AgentCreateValues>({
    resolver: zodResolver(agentCreateSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      agentType: 'prospector',
      personalityStyle: 'consultative',
      senderName: '',
      senderTitle: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        agentType: values.agentType,
        personalityStyle: values.personalityStyle,
        senderName: values.senderName,
      };
      if (values.senderTitle?.trim()) payload.senderTitle = values.senderTitle.trim();
      const created = await api.post<{ id: string }>('/agents', payload);
      toast.success('Agent created');
      onCreated();
      onOpenChange(false);
      reset();
      navigate(`/agents/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create agent');
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
            <DialogTitle>New agent</DialogTitle>
            <DialogDescription>
              Quick-create an agent with the essentials. Flesh out tone, writing style, and
              escalation rules in the Agent Builder stage afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field>
              <FieldLabel htmlFor="a-name">Agent name</FieldLabel>
              <Input
                id="a-name"
                autoFocus
                placeholder="Alex, the friendly closer"
                aria-invalid={errors.name ? 'true' : 'false'}
                {...register('name')}
              />
              <FieldError>{errors.name?.message}</FieldError>
              <FieldHint>Internal name — not shown to prospects.</FieldHint>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="a-type">Role</FieldLabel>
                <Select id="a-type" options={AGENT_TYPES} {...register('agentType')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="a-style">Personality</FieldLabel>
                <Select
                  id="a-style"
                  options={PERSONALITY_STYLES}
                  {...register('personalityStyle')}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="a-sender">Sender name</FieldLabel>
              <Input
                id="a-sender"
                placeholder="Alex Rivera"
                aria-invalid={errors.senderName ? 'true' : 'false'}
                {...register('senderName')}
              />
              <FieldError>{errors.senderName?.message}</FieldError>
              <FieldHint>Shown on outbound messages.</FieldHint>
            </Field>
            <Field>
              <FieldLabel htmlFor="a-title">Sender title (optional)</FieldLabel>
              <Input
                id="a-title"
                placeholder="Account Executive"
                {...register('senderTitle')}
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
              Create agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
