import { Check, CloudCheck, DownloadSimple, XCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useCheckout } from '@/hooks/useCheckout';
import { api, ApiError } from '@/lib/api';
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  YEARLY_DISCOUNT_PERCENT,
  YEARLY_FULL_PRICE_EQUIVALENT,
  YEARLY_MONTHLY_EQUIVALENT,
  YEARLY_PRICE,
  formatBRL,
} from '@/lib/plans';
import type { Subscription } from '@/lib/types';

export function SubscriptionPage() {
  const { user, refreshUser } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { startCheckout, loading: checkoutLoading, error: checkoutError } = useCheckout();

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

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-[880px]">
        <h3 className="mb-3 max-w-[22ch] text-2xl">
          Seu histórico completo custa menos que um café.
        </h3>
        <p className="mb-8 max-w-[50ch] text-sm text-muted">
          O timer é grátis para sempre. O Premium guarda cada sessão desde o primeiro dia
          — é o que faz o relatório valer.
        </p>

        {(checkoutError || cancelError) && (
          <p className="mb-6 text-sm text-cta">{checkoutError ?? cancelError}</p>
        )}

        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          <div className="card flex flex-col gap-4 p-8">
            <div className="flex items-center justify-between">
              <h6 className="m-0">Gratuito</h6>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-3xl tabular-nums tracking-tight">
                R$0
              </span>
              <span className="text-xs text-muted">/sempre</span>
            </div>
            <div className="h-px bg-divider" />
            <div className="flex flex-1 flex-col gap-2.5">
              {FREE_FEATURES.map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-[13px]">
                  <Check size={15} className="mt-0.5 text-muted" />
                  {f}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" disabled>
              {isPremium ? 'Plano anterior' : 'Plano atual'}
            </button>
          </div>

          <div
            className="card flex flex-col gap-4 p-8"
            style={{ borderColor: 'var(--color-accent)', boxShadow: 'var(--shadow-md)' }}
          >
            <div className="flex items-center justify-between">
              <h6 className="m-0">Premium</h6>
              <span className="tag tag-accent text-[9px]">
                -{YEARLY_DISCOUNT_PERCENT}%
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-3xl tabular-nums tracking-tight">
                  R${formatBRL(YEARLY_PRICE)}
                </span>
                <span className="text-xs text-muted">/ano</span>
                <span className="text-sm tabular-nums text-muted line-through">
                  R${formatBRL(YEARLY_FULL_PRICE_EQUIVALENT)}
                </span>
              </div>
              <div className="mt-1 text-xs text-ok">
                equivale a R${formatBRL(YEARLY_MONTHLY_EQUIVALENT)}/mês
              </div>
            </div>
            <div className="text-xs text-muted">
              Cobrado via Mercado Pago · cartão ou PIX
            </div>
            <div className="h-px bg-divider" />
            <div className="flex flex-1 flex-col gap-2.5">
              {PREMIUM_FEATURES.map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-[13px]">
                  <Check size={15} className="mt-0.5 text-accent" />
                  {f}
                </div>
              ))}
            </div>
            {isPremium ? (
              <button
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelando…' : 'Cancelar assinatura'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => startCheckout('YEARLY')}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? 'Abrindo checkout…' : 'Assinar Premium'}
              </button>
            )}
          </div>
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
