import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';

import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/context/AuthContext';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SubjectsPage } from '@/pages/SubjectsPage';
import { SubscriptionCallbackPage } from '@/pages/SubscriptionCallbackPage';
import { SubscriptionPage } from '@/pages/SubscriptionPage';
import { TimerPage } from '@/pages/TimerPage';

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted text-sm">
        Carregando…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/subscription/callback" element={<SubscriptionCallbackPage />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
