import { Check, Timer as TimerIcon } from '@phosphor-icons/react';
import { Navigate, useNavigate } from 'react-router-dom';

import { Foki } from '@/components/Foki';
import { useAuth } from '@/context/AuthContext';
import { useCheckout } from '@/hooks/useCheckout';
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  YEARLY_DISCOUNT_PERCENT,
  YEARLY_FULL_PRICE_EQUIVALENT,
  YEARLY_MONTHLY_EQUIVALENT,
  YEARLY_PRICE,
  formatBRL,
} from '@/lib/plans';

export function OnboardingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { startCheckout, loading: checkoutLoading, error: checkoutError } = useCheckout();

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-3xl">
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

        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          <div className="card flex flex-col gap-4 p-8">
            <h6 className="m-0">Gratuito</h6>
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-2xl tabular-nums tracking-tight">
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
            <button className="btn btn-secondary" onClick={() => navigate('/timer')}>
              Começar grátis
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
                <span className="font-heading text-2xl tabular-nums tracking-tight">
                  R${formatBRL(YEARLY_PRICE)}
                </span>
                <span className="text-xs text-muted">/ano</span>
                <span className="text-xs tabular-nums text-muted line-through">
                  R${formatBRL(YEARLY_FULL_PRICE_EQUIVALENT)}
                </span>
              </div>
              <div className="mt-1 text-xs text-ok">
                equivale a R${formatBRL(YEARLY_MONTHLY_EQUIVALENT)}/mês
              </div>
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
            <button
              className="btn btn-primary"
              onClick={() => startCheckout('YEARLY')}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? 'Abrindo checkout…' : 'Assinar Premium'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted">
          <button className="text-accent" onClick={() => navigate('/timer')}>
            Pular por agora
          </button>
        </p>
      </div>
    </div>
  );
}
