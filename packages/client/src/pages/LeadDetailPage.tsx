import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  Activity,
  Mail,
  MessageSquare,
  StickyNote,
  Trash2,
  User2,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { PageHeader } from '../components/ui/PageHeader';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  LoadingBlock,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
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

interface Note {
  id: string;
  body: string | null;
  userId: string | null;
  createdAt: string;
  authorFirstName: string | null;
  authorLastName: string | null;
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

  // Notes live as activities with activityType 'note_added'; hide them from the
  // generic Activity/Messages tabs so they only appear in Notes.
  const nonNoteActivities = activities.filter((a) => a.activityType !== 'note_added');
  const messages = nonNoteActivities.filter((a) =>
    /email|message|reply|sms|linkedin/i.test(a.activityType),
  );
  const otherActivity = nonNoteActivities.filter((a) => !messages.includes(a));

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
                {otherActivity.length > 0 && (
                  <span className="ml-1 rounded-full bg-surface-muted px-1.5 text-[10px] text-text-muted">
                    {otherActivity.length}
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
              {id && <NotesPanel leadId={id} />}
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

function NotesPanel({ leadId }: { leadId: string }) {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    try {
      const rows = await api.get<Note[]>(`/activities/notes?leadId=${leadId}`);
      setNotes(rows);
    } catch {
      setNotes([]);
    }
  }

  useEffect(() => {
    void refresh();
  }, [leadId]);

  async function submit() {
    const body = draft.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.post<Note>('/activities/notes', { leadId, body });
      setNotes((prev) => (prev ? [created, ...prev] : [created]));
      setDraft('');
      toast.success('Note added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save note');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/activities/notes/${deleteTarget.id}`);
      setNotes((prev) => prev?.filter((n) => n.id !== deleteTarget.id) ?? []);
      toast.success('Note deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="new-note" className="sr-only">
          Add a note
        </label>
        <Textarea
          id="new-note"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for your team — context, next steps, a quick reminder…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-xs text-text-muted">
            <kbd className="rounded border border-border-default bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
              ⌘
            </kbd>
            <span className="mx-0.5">+</span>
            <kbd className="rounded border border-border-default bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
              Enter
            </kbd>{' '}
            to save
          </div>
          <Button
            onClick={() => void submit()}
            loading={submitting}
            disabled={!draft.trim() || submitting}
          >
            Add note
          </Button>
        </div>
      </div>

      <div>
        {notes === null ? (
          <div className="text-sm text-text-muted">Loading notes…</div>
        ) : notes.length === 0 ? (
          <EmptyState
            compact
            icon={StickyNote}
            title="No notes yet"
            description="Jot down context, follow-ups, or reminders for your team."
          />
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => {
              const author = formatAuthor(n);
              const canDelete = isAdmin || n.userId === currentUser?.id;
              return (
                <li
                  key={n.id}
                  className="group rounded-lg border border-border-subtle bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-text-muted">
                        <span className="font-medium text-text-primary">{author}</span>
                        <span className="mx-1">·</span>
                        <time
                          dateTime={new Date(n.createdAt).toISOString()}
                          title={new Date(n.createdAt).toLocaleString()}
                        >
                          {formatRelative(n.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap break-words">
                        {n.body}
                      </p>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(n)}
                        className="hidden group-hover:inline-flex text-text-muted hover:text-red-600 p-1 rounded-md"
                        title="Delete note"
                        aria-label="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete note?"
        description="This permanently removes the note from the lead's activity."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function formatAuthor(note: Note): string {
  const first = note.authorFirstName?.trim();
  const last = note.authorLastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return note.userId ? 'Teammate' : 'Unknown';
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}

function activitiesToTimeline(activities: Activity[]): TimelineItem[] {
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
  if (/reply|won|converted|qualified/i.test(type)) return 'positive';
  if (/bounce|fail|error|dnc|disqualified/i.test(type)) return 'critical';
  if (/warn|risk/i.test(type)) return 'warning';
  if (/sent|created|opened|clicked/i.test(type)) return 'brand';
  return 'neutral';
}
