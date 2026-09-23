import { Timer as TimerIcon } from '@phosphor-icons/react';
import { Navigate, useNavigate } from 'react-router-dom';

import { Foki } from '@/components/Foki';
import { PlanCards, type PlanCardAction } from '@/components/PlanCards';
import { useAuth } from '@/context/AuthContext';
import { useCheckout } from '@/hooks/useCheckout';

export function OnboardingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { startCheckout, loadingCycle, error: checkoutError } = useCheckout();

  if (!loading && !user) return <Navigate to="/login" replace />;

  const free: PlanCardAction = {
    label: 'Começar grátis',
    onClick: () => navigate('/timer'),
  };
  const monthly: PlanCardAction = {
    label: 'Assinar mensal',
    onClick: () => startCheckout('MONTHLY'),
    loading: loadingCycle === 'MONTHLY',
  };
  const yearly: PlanCardAction = {
    label: 'Assinar anual',
    onClick: () => startCheckout('YEARLY'),
    loading: loadingCycle === 'YEARLY',
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-4xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <Foki state="idle" size={48} />
          <div>
            <div className="flex items-center gap-2">
              <TimerIcon weight="fill" size={18} className="text-accent" />
              <span className="font-heading text-base tracking-tight">Pomofoca</span>
            </div>
            <p className="text-xs text-muted">
              Bem-vindo(a), {user?.name.split(' ')[0]}!
            </p>
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl">Escolha como quer começar</h1>
        <p className="mb-8 text-center text-sm text-muted">
          Você pode mudar de plano quando quiser — o timer é grátis pra sempre.
        </p>

        {checkoutError && (
          <p className="mb-6 text-center text-sm text-cta">{checkoutError}</p>
        )}

        <PlanCards free={free} monthly={monthly} yearly={yearly} />
      </div>
    </div>
  );
}
