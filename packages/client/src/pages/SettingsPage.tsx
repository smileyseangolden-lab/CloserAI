import { NavLink, Route, Routes } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { LoadingBlock } from '../components/ui';

export function SettingsPage() {
  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Settings" subtitle="Organization, profile, email, and team" />

      <div className="flex gap-6">
        <nav className="w-48 flex-shrink-0 space-y-1">
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
                `block px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1 card p-6">
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

function OrganizationSettings() {
  const [org, setOrg] = useState<{ name: string; industry: string | null; website: string | null } | null>(null);
  useEffect(() => {
    void api.get<typeof org>('/organizations/current').then(setOrg);
  }, []);
  if (!org) return <LoadingBlock label="Loading organization settings…" />;
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Organization</h2>
      <div>
        <label className="label">Name</label>
        <input className="input" defaultValue={org.name} />
      </div>
      <div>
        <label className="label">Industry</label>
        <input className="input" defaultValue={org.industry ?? ''} />
      </div>
      <div>
        <label className="label">Website</label>
        <input className="input" defaultValue={org.website ?? ''} />
      </div>
    </div>
  );
}

function BusinessProfileSettings() {
  return <div className="text-sm text-slate-500">Business profile config.</div>;
}

function IcpsSettings() {
  return <div className="text-sm text-slate-500">ICP management.</div>;
}

function TeamSettings() {
  return <div className="text-sm text-slate-500">Team & invitations.</div>;
}

function EmailSettings() {
  return <div className="text-sm text-slate-500">Email domains, accounts, warmup.</div>;
}
