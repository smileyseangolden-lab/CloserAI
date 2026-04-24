import { Link, NavLink, Route, Routes } from 'react-router';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2,
  Mail,
  Plus,
  Target,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
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
  toast,
} from '../components/ui';

export function SettingsPage() {
  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <PageHeader title="Settings" subtitle="Organization, profile, ICPs, team, and email" />

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        <nav className="md:w-48 flex-shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {[
            { to: '/settings', label: 'Organization', end: true },
            { to: '/settings/profile', label: 'Business profile' },
            { to: '/settings/icps', label: 'ICPs' },
            { to: '/settings/team', label: 'Team' },
            { to: '/settings/email', label: 'Email' },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'text-text-secondary hover:bg-surface-muted'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1 min-w-0 card p-4 md:p-6">
          <Routes>
            <Route index element={<OrganizationSettings />} />
            <Route path="profile" element={<BusinessProfileSettings />} />
            <Route path="icps" element={<IcpsSettings />} />
            <Route path="team" element={<TeamSettings />} />
            <Route path="email" element={<EmailSettings />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Organization
// ────────────────────────────────────────────────────────────────────

const orgSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  industry: z.string().trim().max(200).optional(),
  website: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^https?:\/\//i.test(v),
      'Website should start with http:// or https://',
    ),
  description: z.string().trim().max(2000).optional(),
});

type OrgValues = z.infer<typeof orgSchema>;

function OrganizationSettings() {
  const [org, setOrg] = useState<OrgValues | null>(null);

  const form = useForm<OrgValues>({
    resolver: zodResolver(orgSchema),
    mode: 'onChange',
    defaultValues: { name: '', industry: '', website: '', description: '' },
  });

  useEffect(() => {
    void api
      .get<OrgValues>('/organizations/current')
      .then((o) => {
        const loaded: OrgValues = {
          name: o?.name ?? '',
          industry: o?.industry ?? '',
          website: o?.website ?? '',
          description: o?.description ?? '',
        };
        setOrg(loaded);
        form.reset(loaded);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : 'Could not load organization'),
      );
  }, [form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload: Record<string, unknown> = { name: values.name };
      if (values.industry?.trim()) payload.industry = values.industry.trim();
      if (values.website?.trim()) payload.website = values.website.trim();
      if (values.description?.trim()) payload.description = values.description.trim();
      const updated = await api.patch<OrgValues>('/organizations/current', payload);
      setOrg({
        name: updated.name ?? '',
        industry: updated.industry ?? '',
        website: updated.website ?? '',
        description: updated.description ?? '',
      });
      form.reset({
        name: updated.name ?? '',
        industry: updated.industry ?? '',
        website: updated.website ?? '',
        description: updated.description ?? '',
      });
      toast.success('Organization updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  });

  if (!org) return <LoadingBlock label="Loading organization settings…" />;

  const {
    register,
    formState: { errors, isSubmitting, isDirty, isValid },
  } = form;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <h2 className="font-semibold text-text-primary">Organization</h2>
      <Field>
        <FieldLabel htmlFor="org-name">Name</FieldLabel>
        <Input
          id="org-name"
          aria-invalid={errors.name ? 'true' : 'false'}
          {...register('name')}
        />
        <FieldError>{errors.name?.message}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="org-industry">Industry</FieldLabel>
        <Input id="org-industry" {...register('industry')} />
      </Field>
      <Field>
        <FieldLabel htmlFor="org-website">Website</FieldLabel>
        <Input
          id="org-website"
          placeholder="https://yourcompany.com"
          aria-invalid={errors.website ? 'true' : 'false'}
          {...register('website')}
        />
        <FieldError>{errors.website?.message}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="org-description">Description</FieldLabel>
        <textarea
          id="org-description"
          rows={3}
          className="input resize-none"
          {...register('description')}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
        <Button
          type="button"
          variant="secondary"
          onClick={() => form.reset(org)}
          disabled={!isDirty || isSubmitting}
        >
          Revert
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty || !isValid}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────
// Business profile — read-only summary with link into the stage
// ────────────────────────────────────────────────────────────────────

interface BusinessProfile {
  companyName: string | null;
  industry: string | null;
  companySize: string | null;
  website: string | null;
  valueProposition: string | null;
  keyDifferentiators: string[] | null;
}

function BusinessProfileSettings() {
  const [profile, setProfile] = useState<BusinessProfile | null | undefined>(undefined);

  useEffect(() => {
    void api
      .get<BusinessProfile | null>('/profiles')
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  if (profile === undefined) return <LoadingBlock label="Loading business profile…" />;

  if (!profile) {
    return (
      <EmptyState
        icon={Building2}
        title="No business profile yet"
        description="Bootstrap your profile by running the Company Profile stage — the assistant fills it from your website."
        action={
          <Link to="/stages/company-profile" className="btn-primary">
            Open Company Profile
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-text-primary">Business profile</h2>
        <Link to="/stages/company-profile" className="btn-secondary text-xs">
          Edit in stage
        </Link>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <Row label="Company">{profile.companyName ?? '—'}</Row>
        <Row label="Industry">{profile.industry ?? '—'}</Row>
        <Row label="Size">{profile.companySize ?? '—'}</Row>
        <Row label="Website">{profile.website ?? '—'}</Row>
        <Row label="Value proposition" full>
          {profile.valueProposition ?? '—'}
        </Row>
        <Row label="Differentiators" full>
          {profile.keyDifferentiators && profile.keyDifferentiators.length > 0 ? (
            <ul className="list-disc ml-5 space-y-1">
              {profile.keyDifferentiators.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            '—'
          )}
        </Row>
      </dl>
    </div>
  );
}

function Row({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-text-primary">{children}</dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// ICPs — list + create + delete via /icps
// ────────────────────────────────────────────────────────────────────

interface Icp {
  id: string;
  name: string;
  description: string | null;
  targetIndustries: string[] | null;
  targetCompanySizes: string[] | null;
  isActive: boolean;
  priority: number;
}

function IcpsSettings() {
  const [icps, setIcps] = useState<Icp[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Icp | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void api
      .get<Icp[]>('/icps')
      .then(setIcps)
      .catch(() => setIcps([]));
  }, [refreshKey]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/icps/${deleteTarget.id}`);
      toast.success('ICP deleted');
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  if (icps === null) return <LoadingBlock label="Loading ICPs…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-text-primary">Ideal customer profiles</h2>
          <p className="text-sm text-text-muted">
            Define who you sell to. Campaigns and lead scoring consume these.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New ICP
        </Button>
      </div>

      {icps.length === 0 ? (
        <EmptyState
          compact
          icon={Target}
          title="No ICPs yet"
          description="Create your first Ideal Customer Profile, or generate richer tiers from the ICP stage."
          action={
            <>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> New ICP
              </Button>
              <Link to="/stages/icp" className="btn-secondary">
                Open ICP stage
              </Link>
            </>
          }
        />
      ) : (
        <ul className="space-y-2">
          {icps.map((icp) => (
            <li
              key={icp.id}
              className="group rounded-lg border border-border-subtle p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-text-primary flex items-center gap-2">
                  {icp.name}
                  {!icp.isActive && (
                    <span className="badge bg-surface-muted text-text-muted">inactive</span>
                  )}
                </div>
                {icp.description && (
                  <p className="text-sm text-text-secondary mt-0.5">{icp.description}</p>
                )}
                {(icp.targetIndustries && icp.targetIndustries.length > 0) ||
                (icp.targetCompanySizes && icp.targetCompanySizes.length > 0) ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {icp.targetIndustries?.slice(0, 4).map((i) => (
                      <span
                        key={`ind-${i}`}
                        className="badge bg-surface-muted text-text-secondary"
                      >
                        {i}
                      </span>
                    ))}
                    {icp.targetCompanySizes?.slice(0, 4).map((s) => (
                      <span
                        key={`size-${s}`}
                        className="badge bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(icp)}
                className="hidden group-hover:inline-flex text-text-muted hover:text-red-600 p-1 rounded-md"
                aria-label={`Delete ${icp.name}`}
                title="Delete ICP"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateIcpDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete ICP?"
        description={
          deleteTarget ? (
            <>
              This removes <strong>{deleteTarget.name}</strong>. Existing leads that reference
              it are kept.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

const icpCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().trim().max(1000).optional(),
});
type IcpCreateValues = z.infer<typeof icpCreateSchema>;

function CreateIcpDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<IcpCreateValues>({
    resolver: zodResolver(icpCreateSchema),
    mode: 'onChange',
    defaultValues: { name: '', description: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/icps', {
        name: values.name,
        description: values.description?.trim() || undefined,
      });
      toast.success('ICP created');
      onCreated();
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create ICP');
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
            <DialogTitle>New ICP</DialogTitle>
            <DialogDescription>
              Just the essentials. Add target industries, sizes, and signals from the ICP
              stage.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field>
              <FieldLabel htmlFor="icp-name">Name</FieldLabel>
              <Input
                id="icp-name"
                autoFocus
                placeholder="Mid-market SaaS VPs"
                aria-invalid={errors.name ? 'true' : 'false'}
                {...register('name')}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="icp-description">Description (optional)</FieldLabel>
              <textarea
                id="icp-description"
                rows={3}
                className="input resize-none"
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
              Create ICP
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────
// Team — list users, invite
// ────────────────────────────────────────────────────────────────────

interface TeamUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
}

const INVITE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

function TeamSettings() {
  const currentUser = useAuthStore((s) => s.user);
  const canInvite = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    void api
      .get<TeamUser[]>('/users')
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  if (users === null) return <LoadingBlock label="Loading team…" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-text-primary">Team</h2>
          <p className="text-sm text-text-muted">
            {users.length} {users.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus size={14} /> Invite teammate
          </Button>
        )}
      </div>

      {users.length === 0 ? (
        <EmptyState
          compact
          icon={UsersIcon}
          title="Just you for now"
          description={
            canInvite
              ? 'Invite a teammate to collaborate on campaigns and approvals.'
              : 'No other teammates yet.'
          }
          action={
            canInvite ? (
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus size={14} /> Invite teammate
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-full bg-surface-muted text-text-primary flex items-center justify-center text-xs font-semibold">
                {(u.firstName?.[0] ?? u.email[0] ?? '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-text-primary truncate">
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs text-text-muted">(you)</span>
                  )}
                </div>
                <div className="text-xs text-text-muted truncate">{u.email}</div>
              </div>
              <span className="badge bg-surface-muted text-text-secondary capitalize">
                {u.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

const inviteSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  role: z.enum(['admin', 'manager', 'member', 'viewer']),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    mode: 'onChange',
    defaultValues: { email: '', role: 'member' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post('/users/invite', values);
      toast.success(`Invite sent to ${values.email}`);
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
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
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They'll get an email with a link to create their account.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field>
              <FieldLabel htmlFor="inv-email">Work email</FieldLabel>
              <Input
                id="inv-email"
                type="email"
                autoFocus
                aria-invalid={errors.email ? 'true' : 'false'}
                {...register('email')}
              />
              <FieldError>{errors.email?.message}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-role">Role</FieldLabel>
              <Select id="inv-role" options={INVITE_ROLES} {...register('role')} />
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
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────
// Email — signposted; live config lives in Integrations & Deployment
// ────────────────────────────────────────────────────────────────────

function EmailSettings() {
  return (
    <EmptyState
      icon={Mail}
      title="Email setup lives in two places today"
      description="Provider keys (Gmail, Outlook, SES, etc.) are configured under Admin → Integrations. Per-agent sender addresses, warmup, and cadence channels are configured in the Deployment stage."
      action={
        <>
          <Link to="/admin/integrations" className="btn-primary">
            Open Integrations
          </Link>
          <Link to="/stages/deployment" className="btn-secondary">
            Open Deployment
          </Link>
        </>
      }
    />
  );
}
