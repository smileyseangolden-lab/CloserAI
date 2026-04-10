import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuthStore } from '../../stores/auth';

export function LoginPage() {
  const [email, setEmail] = useState('demo@closerai.local');
  const [password, setPassword] = useState('demopassword');
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const loading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      /* shown via store */
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md card p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold">
            C
          </div>
          <span className="text-xl font-semibold tracking-tight">CloserAI</span>
        </div>
        <h1 className="text-2xl font-semibold mb-2">Welcome back</h1>
        <p className="text-sm text-slate-500 mb-6">Sign in to your workspace.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="text-sm text-slate-500 mt-6 text-center">
          No account?{' '}
          <Link to="/register" className="text-brand-600 font-medium">
            Start free trial
          </Link>
        </p>
      </div>
    </div>
  );
}
