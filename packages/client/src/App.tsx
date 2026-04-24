import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuthStore } from './stores/auth';
import { AppLayout } from './components/layout/AppLayout';
import { LoadingBlock } from './components/ui';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { StagePage } from './pages/stages/StagePage';
import { LeadsPage } from './pages/LeadsPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { CampaignDetailPage } from './pages/CampaignDetailPage';
import { AgentsPage } from './pages/AgentsPage';
import { AgentDetailPage } from './pages/AgentDetailPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { CrmCallbackPage } from './pages/oauth/CrmCallbackPage';
import { DashboardBuilderPage } from './pages/dashboards/DashboardBuilderPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  if (loading) return <LoadingBlock label="Checking your session…" className="h-screen" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const loadCurrentUser = useAuthStore((s) => s.loadCurrentUser);
  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* OAuth popup landing page — must render outside the AppLayout. */}
      <Route path="/oauth/crm-callback" element={<CrmCallbackPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="dashboards/:id" element={<DashboardBuilderPage />} />
        <Route path="stages/:stageId" element={<StagePage />} />

        {/* Legacy routes — kept reachable from deep links and the workflow pages. */}
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="agents/:id" element={<AgentDetailPage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings/*" element={<SettingsPage />} />
        <Route path="admin/integrations" element={<IntegrationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
