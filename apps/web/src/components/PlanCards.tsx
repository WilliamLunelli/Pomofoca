import { Check } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import {
  FREE_FEATURES,
  MONTHLY_PRICE,
  PREMIUM_FEATURES,
  YEARLY_DISCOUNT_PERCENT,
  YEARLY_FULL_PRICE_EQUIVALENT,
  YEARLY_MONTHLY_EQUIVALENT,
  YEARLY_PRICE,
  formatBRL,
} from '@/lib/plans';

export interface PlanCardAction {
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface PlanCardsProps {
  free: PlanCardAction;
  monthly: PlanCardAction;
  yearly: PlanCardAction;
}

function ActionButton({ action, primary }: { action: PlanCardAction; primary: boolean }) {
  const className = `btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-block`;
  const content = action.loading ? 'Abrindo checkout…' : action.label;

  if (action.to && !action.disabled) {
    return (
      <Link to={action.to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      className={className}
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
    >
      {content}
    </button>
  );
}

/**
 * Os 3 cards de plano (Gratuito, Premium Mensal, Premium Anual), reaproveitados por
 * LandingPage, OnboardingPage e SubscriptionPage. Peso visual equivalente entre os 3
 * - o anual só se destaca pela borda accent + selo de desconto, não por tamanho.
 */
export function PlanCards({ free, monthly, yearly }: PlanCardsProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      <div className="card flex flex-col gap-4 p-8">
        <h6 className="m-0">Gratuito</h6>
        <div className="flex items-baseline gap-1">
          <span className="font-heading text-2xl tabular-nums tracking-tight">R$0</span>
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
        <ActionButton action={free} primary={false} />
      </div>

      <div className="card flex flex-col gap-4 p-8">
        <h6 className="m-0">Premium Mensal</h6>
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
        <ActionButton action={monthly} primary />
      </div>

      <div
        className="card flex flex-col gap-4 p-8"
        style={{ borderColor: 'var(--color-accent)', boxShadow: 'var(--shadow-md)' }}
      >
        <div className="flex items-center justify-between">
          <h6 className="m-0">Premium Anual</h6>
          <div className="flex items-center gap-1.5">
            <span className="tag tag-accent text-[9px]">-{YEARLY_DISCOUNT_PERCENT}%</span>
            <span className="text-[9px] uppercase tracking-wide text-accent">
              Recomendado
            </span>
          </div>
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
        <ActionButton action={yearly} primary />
      </div>
    </div>
  );
}
