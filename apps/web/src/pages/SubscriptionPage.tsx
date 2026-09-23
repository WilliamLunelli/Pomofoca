import { CloudCheck, DownloadSimple, XCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { PlanCards, type PlanCardAction } from '@/components/PlanCards';
import { useAuth } from '@/context/AuthContext';
import { useCheckout } from '@/hooks/useCheckout';
import { api, ApiError } from '@/lib/api';
import type { Subscription } from '@/lib/types';

export function SubscriptionPage() {
  const { user, refreshUser } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { startCheckout, loadingCycle, error: checkoutError } = useCheckout();

  useEffect(() => {
    api
      .get<Subscription | null>('/subscriptions')
      .then(setSubscription)
      .catch(() => {});
  }, []);

  async function handleCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      await api.post('/subscriptions/cancel');
      await refreshUser();
      setSubscription(await api.get<Subscription | null>('/subscriptions'));
    } catch (err) {
      setCancelError(
        err instanceof ApiError ? err.message : 'Não foi possível cancelar.',
      );
    } finally {
      setCancelling(false);
    }
  }

  const isPremium = user?.plan === 'PREMIUM';
  const currentCycle = subscription?.billingCycle;

  const free: PlanCardAction = {
    label: isPremium ? 'Plano anterior' : 'Plano atual',
    disabled: true,
  };

  function premiumAction(cycle: 'MONTHLY' | 'YEARLY'): PlanCardAction {
    if (!isPremium) {
      return {
        label: 'Assinar Premium',
        onClick: () => startCheckout(cycle),
        loading: loadingCycle === cycle,
      };
    }
    if (currentCycle === cycle) {
      return {
        label: cancelling ? 'Cancelando…' : 'Cancelar assinatura',
        onClick: handleCancel,
        disabled: cancelling,
      };
    }
    return { label: 'Plano não ativo', disabled: true };
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-[980px]">
        <h3 className="mb-3 max-w-[26ch] text-2xl">
          Seu histórico completo custa menos que um café.
        </h3>
        <p className="mb-8 max-w-[50ch] text-sm text-muted">
          O timer é grátis para sempre. O Premium guarda cada sessão desde o primeiro dia
          — é o que faz o relatório valer.
        </p>

        {(checkoutError || cancelError) && (
          <p className="mb-6 text-sm text-cta">{checkoutError ?? cancelError}</p>
        )}

        <div className="mb-8">
          <PlanCards
            free={free}
            monthly={premiumAction('MONTHLY')}
            yearly={premiumAction('YEARLY')}
          />
        </div>

        {subscription && (
          <p className="mb-6 text-xs text-muted">
            Status da assinatura: {subscription.status} ·{' '}
            {subscription.billingCycle === 'YEARLY' ? 'plano anual' : 'plano mensal'} ·
            desde {new Date(subscription.startDate).toLocaleDateString('pt-BR')}
          </p>
        )}

        <div className="flex flex-wrap gap-8 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <XCircle size={14} /> Cancele quando quiser
          </span>
          <span className="flex items-center gap-1.5">
            <CloudCheck size={14} /> Dados sincronizados em todos os dispositivos
          </span>
          <span className="flex items-center gap-1.5">
            <DownloadSimple size={14} /> Exporte tudo quando quiser
          </span>
        </div>
      </div>
    </div>
  );
}
