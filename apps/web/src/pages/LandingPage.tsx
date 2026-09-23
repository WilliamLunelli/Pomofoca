import {
  ChartLineUp,
  Check,
  Flame,
  Books,
  Timer as TimerIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import { Foki } from '@/components/Foki';
import { useAuth } from '@/context/AuthContext';
import {
  FREE_FEATURES,
  MONTHLY_PRICE,
  PREMIUM_FEATURES,
  YEARLY_DISCOUNT_PERCENT,
  formatBRL,
} from '@/lib/plans';

const FEATURES = [
  {
    icon: TimerIcon,
    title: 'Timer pomodoro de verdade',
    body: 'Ciclos de foco e pausa configuráveis, funcionando offline como um app instalável.',
  },
  {
    icon: Books,
    title: 'Organize por matéria',
    body: 'Cada sessão fica ligada à matéria certa, com cor e meta semanal próprias.',
  },
  {
    icon: ChartLineUp,
    title: 'Relatórios que mostram o progresso',
    body: 'Heatmap anual, distribuição por matéria, evolução semanal e comparativo de período.',
  },
  {
    icon: Flame,
    title: 'Sequência de estudo',
    body: 'Acompanhe sua streak e seu recorde — a Foki comemora junto com você.',
  },
];

export function LandingPage() {
  const { user } = useAuth();
  const primaryCtaTo = user ? '/timer' : '/register';
  const primaryCtaLabel = user ? 'Ir para o app' : 'Criar conta grátis';

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2">
          <TimerIcon weight="fill" size={20} className="text-accent" />
          <span className="font-heading text-lg tracking-tight">Pomofoca</span>
        </div>
        <nav className="flex items-center gap-4">
          {user ? (
            <Link to="/timer" className="btn btn-secondary">
              Ir para o app
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm text-muted hover:text-text">
                Entrar
              </Link>
              <Link to="/register" className="btn btn-primary">
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="px-6 pb-20 pt-10 md:px-12 md:pt-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="mb-6 flex items-center gap-3">
            <Foki state="idle" size={64} />
          </div>
          <h1 className="mb-4 max-w-2xl text-4xl leading-tight md:text-5xl">
            Sua jornada de estudo, medida de verdade.
          </h1>
          <p className="mb-8 max-w-xl text-base text-muted">
            Pomofoca é um timer pomodoro com relatórios detalhados de estudo por matéria —
            pra você enxergar exatamente onde está investindo seu tempo.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to={primaryCtaTo} className="btn btn-primary min-w-[180px] text-[15px]">
              {primaryCtaLabel}
            </Link>
            {!user && (
              <Link to="/login" className="btn btn-ghost">
                Já tenho conta
              </Link>
            )}
          </div>
          <p className="mt-4 text-xs text-muted">
            Grátis para sempre no plano básico — sem cartão de crédito.
          </p>
        </div>
      </section>

      <section className="px-6 py-16 md:px-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl">
            Tudo que você precisa pra estudar melhor
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <f.icon size={24} className="mb-4 text-accent" />
                <h3 className="mb-2 text-[15px] font-heading">{f.title}</h3>
                <p className="text-[13px] text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 md:px-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-2 text-center text-2xl">
            Comece grátis, evolua quando quiser
          </h2>
          <p className="mb-10 text-center text-sm text-muted">
            O plano Premium libera o histórico completo — a partir de R$
            {formatBRL(MONTHLY_PRICE)}/mês, com até {YEARLY_DISCOUNT_PERCENT}% de desconto
            no anual.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="card flex flex-col gap-4 p-8">
              <h6 className="m-0">Gratuito</h6>
              <div className="flex items-baseline gap-1">
                <span className="font-heading text-2xl tabular-nums tracking-tight">
                  R$0
                </span>
                <span className="text-xs text-muted">/sempre</span>
              </div>
              <div className="h-px bg-divider" />
              <div className="flex flex-col gap-2.5">
                {FREE_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-2.5 text-[13px]">
                    <Check size={15} className="mt-0.5 text-muted" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
            <div
              className="card flex flex-col gap-4 p-8"
              style={{
                borderColor: 'var(--color-accent)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <h6 className="m-0">Premium</h6>
              <div className="flex items-baseline gap-1">
                <span className="font-heading text-2xl tabular-nums tracking-tight">
                  R${formatBRL(MONTHLY_PRICE)}
                </span>
                <span className="text-xs text-muted">/mês</span>
              </div>
              <div className="h-px bg-divider" />
              <div className="flex flex-col gap-2.5">
                {PREMIUM_FEATURES.map((f) => (
                  <div key={f} className="flex items-start gap-2.5 text-[13px]">
                    <Check size={15} className="mt-0.5 text-accent" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-8 flex justify-center">
            <Link to={primaryCtaTo} className="btn btn-primary min-w-[180px] text-[15px]">
              {primaryCtaLabel}
            </Link>
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center gap-3 border-t border-divider px-6 py-10 text-center md:px-12">
        <Foki state="sleeping" size={36} />
        <p className="text-xs text-muted">
          Pomofoca — feito para quem estuda de verdade.
        </p>
      </footer>
    </div>
  );
}
