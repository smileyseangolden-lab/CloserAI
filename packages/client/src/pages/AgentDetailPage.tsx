import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { PageHeader } from '../components/ui/PageHeader';
import {
  Button,
  ConfirmDialog,
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
  LoadingBlock,
  Select,
  Textarea,
  toast,
} from '../components/ui';

interface Knowledge {
  id: string;
  knowledgeType: string;
  title: string;
  content: string;
}

interface Agent {
  id: string;
  name: string;
  agentType: string;
  personalityStyle: string;
  toneDescription: string | null;
  senderName: string;
  senderTitle: string | null;
  emailSignature: string | null;
  knowledge: Knowledge[];
}

const KNOWLEDGE_TYPES = [
  { value: 'product_info', label: 'Product info' },
  { value: 'objection_handling', label: 'Objection handling' },
  { value: 'competitor_intel', label: 'Competitor intel' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'case_study', label: 'Case study' },
  { value: 'faq', label: 'FAQ' },
  { value: 'custom', label: 'Custom' },
];

export function AgentDetailPage() {
  const { id } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [scenario, setScenario] = useState(
    'VP of Sales at a 200-person B2B SaaS company. First touch, cold email.',
  );
  const [draft, setDraft] = useState<{ subject: string; bodyText: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [knowledgeDialog, setKnowledgeDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; entry: Knowledge } | null
  >(null);
  const [knowledgeDeleteTarget, setKnowledgeDeleteTarget] = useState<Knowledge | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api.get<Agent>(`/agents/${id}`).then(setAgent);
  }, [id]);

  async function refresh() {
    if (!id) return;
    const updated = await api.get<Agent>(`/agents/${id}`);
    setAgent(updated);
  }

  async function testMessage() {
    if (!id) return;
    setGenerating(true);
    try {
      const result = await api.post<{ subject: string; bodyText: string }>(
        `/agents/${id}/test-message`,
        { scenario },
      );
      setDraft(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate sample');
    } finally {
      setGenerating(false);
    }
  }

  async function confirmDeleteKnowledge() {
    if (!id || !knowledgeDeleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/agents/${id}/knowledge/${knowledgeDeleteTarget.id}`);
      toast.success('Knowledge entry removed');
      setKnowledgeDeleteTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  if (!agent) return <LoadingBlock label="Loading agent…" className="min-h-[60vh]" />;

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <PageHeader
        title={agent.name}
        subtitle={`${agent.senderName}${agent.senderTitle ? `, ${agent.senderTitle}` : ''}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-3 text-text-primary">Personality</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-text-muted">Type</dt>
              <dd className="font-medium capitalize">{agent.agentType}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Style</dt>
              <dd className="font-medium capitalize">{agent.personalityStyle}</dd>
            </div>
            {agent.toneDescription && (
              <div>
                <dt className="text-text-muted">Tone</dt>
                <dd>{agent.toneDescription}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-text-primary">
              Knowledge base ({agent.knowledge.length})
            </h2>
            <Button
              size="sm"
              onClick={() => setKnowledgeDialog({ mode: 'create' })}
            >
              <Plus size={12} /> Add
            </Button>
          </div>
          <div className="space-y-3">
            {agent.knowledge.length === 0 ? (
              <EmptyState
                compact
                title="No knowledge entries yet"
                description="Give the agent product info, objection handling, pricing, or case studies so it can reference them when drafting messages."
                action={
                  <Button onClick={() => setKnowledgeDialog({ mode: 'create' })}>
                    <Plus size={14} /> Add entry
                  </Button>
                }
              />
            ) : (
              agent.knowledge.map((k) => (
                <div
                  key={k.id}
                  className="group border border-border-subtle rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-text-muted uppercase tracking-wide">
                        {k.knowledgeType.replace(/_/g, ' ')}
                      </div>
                      <div className="font-medium text-sm text-text-primary">{k.title}</div>
                      <div className="text-sm text-text-secondary mt-1 whitespace-pre-wrap">
                        {k.content}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() => setKnowledgeDialog({ mode: 'edit', entry: k })}
                        className="p-1 text-text-muted hover:text-text-primary rounded-md"
                        aria-label={`Edit ${k.title}`}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setKnowledgeDeleteTarget(k)}
                        className="p-1 text-text-muted hover:text-red-600 rounded-md"
                        aria-label={`Delete ${k.title}`}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card p-6 mt-6">
        <h2 className="font-semibold mb-3 text-text-primary">Test message generation</h2>
        <textarea
          className="input mb-3"
          rows={3}
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
        />
        <Button onClick={() => void testMessage()} loading={generating}>
          {generating ? 'Generating…' : 'Generate sample'}
        </Button>
        {draft && (
          <div className="mt-4 p-4 bg-surface-muted rounded-lg border border-border-default">
            {draft.subject && (
              <div className="font-medium mb-2 text-text-primary">
                Subject: {draft.subject}
              </div>
            )}
            <div className="text-sm whitespace-pre-wrap text-text-primary">{draft.bodyText}</div>
          </div>
        )}
      </div>

      {id && (
        <KnowledgeDialog
          agentId={id}
          state={knowledgeDialog}
          onOpenChange={(open) => {
            if (!open) setKnowledgeDialog(null);
          }}
          onSaved={() => void refresh()}
        />
      )}

      <ConfirmDialog
        open={knowledgeDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setKnowledgeDeleteTarget(null);
        }}
        title="Delete knowledge entry?"
        description={
          knowledgeDeleteTarget ? (
            <>
              This removes <strong>{knowledgeDeleteTarget.title}</strong> from the agent's
              knowledge base.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDeleteKnowledge}
      />
    </div>
  );
}

const knowledgeSchema = z.object({
  knowledgeType: z.enum([
    'product_info',
    'objection_handling',
    'competitor_intel',
    'pricing',
    'case_study',
    'faq',
    'custom',
  ]),
  title: z.string().trim().min(1, 'Title is required'),
  content: z.string().trim().min(1, 'Content is required'),
});

type KnowledgeValues = z.infer<typeof knowledgeSchema>;

function KnowledgeDialog({
  agentId,
  state,
  onOpenChange,
  onSaved,
}: {
  agentId: string;
  state: { mode: 'create' } | { mode: 'edit'; entry: Knowledge } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const mode = state?.mode ?? 'create';
  const editEntry = state?.mode === 'edit' ? state.entry : null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<KnowledgeValues>({
    resolver: zodResolver(knowledgeSchema),
    mode: 'onChange',
    defaultValues: { knowledgeType: 'product_info', title: '', content: '' },
  });

  useEffect(() => {
    if (state?.mode === 'edit') {
      reset({
        knowledgeType: state.entry.knowledgeType as KnowledgeValues['knowledgeType'],
        title: state.entry.title,
        content: state.entry.content,
      });
    } else if (state?.mode === 'create') {
      reset({ knowledgeType: 'product_info', title: '', content: '' });
    }
  }, [state, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (editEntry) {
        await api.patch(`/agents/${agentId}/knowledge/${editEntry.id}`, values);
        toast.success('Knowledge entry updated');
      } else {
        await api.post(`/agents/${agentId}/knowledge`, values);
        toast.success('Knowledge entry added');
      }
      onSaved();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  });

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {mode === 'edit' ? 'Edit knowledge entry' : 'Add knowledge entry'}
            </DialogTitle>
            <DialogDescription>
              The agent can reference this content when drafting messages.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field>
              <FieldLabel htmlFor="k-type">Type</FieldLabel>
              <Select id="k-type" options={KNOWLEDGE_TYPES} {...register('knowledgeType')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="k-title">Title</FieldLabel>
              <Input
                id="k-title"
                autoFocus
                placeholder="Pricing tiers cheat sheet"
                aria-invalid={errors.title ? 'true' : 'false'}
                {...register('title')}
              />
              <FieldError>{errors.title?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="k-content">Content</FieldLabel>
              <Textarea
                id="k-content"
                rows={8}
                placeholder="Our pricing starts at $X for teams up to 10…"
                aria-invalid={errors.content ? 'true' : 'false'}
                {...register('content')}
              />
              <FieldError>{errors.content?.message}</FieldError>
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
              {mode === 'edit' ? 'Save changes' : 'Add entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
