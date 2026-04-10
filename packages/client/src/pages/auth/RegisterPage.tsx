import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuthStore } from '../../stores/auth';

export function RegisterPage() {
  const [form, setForm] = useState({
    organizationName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    website: '',
  });
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const loading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await register({
        ...form,
        website: form.website || undefined,
      });
      navigate('/onboarding');
    } catch {
      /* shown via store */
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold">
            C
          </div>
          <span className="text-xl font-semibold tracking-tight">CloserAI</span>
        </div>
        <h1 className="text-2xl font-semibold mb-2">Start your free trial</h1>
        <p className="text-sm text-slate-500 mb-6">14 days, no credit card required.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Company name</label>
            <input
              className="input"
              value={form.organizationName}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input
                className="input"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Last name</label>
              <input
                className="input"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="label">Work email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Company website (optional)</label>
            <input
              className="input"
              type="url"
              placeholder="https://..."
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? 'Creating workspace...' : 'Create workspace'}
          </button>
        </form>
        <p className="text-sm text-slate-500 mt-6 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
