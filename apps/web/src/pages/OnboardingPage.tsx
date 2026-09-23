import { Check, Timer as TimerIcon } from '@phosphor-icons/react';
import { Navigate, useNavigate } from 'react-router-dom';

import { Foki } from '@/components/Foki';
import { useAuth } from '@/context/AuthContext';
import { FREE_FEATURES, MONTHLY_PRICE, PREMIUM_FEATURES, formatBRL } from '@/lib/plans';

export function OnboardingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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
              <span className="text-[10px] uppercase tracking-wide text-accent">
                recomendado
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-2xl tabular-nums tracking-tight">
                R${formatBRL(MONTHLY_PRICE)}
              </span>
              <span className="text-xs text-muted">/mês</span>
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
            <button className="btn btn-primary" onClick={() => navigate('/subscription')}>
              Ver planos Premium
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
