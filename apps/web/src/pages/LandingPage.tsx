import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChartLineUp, Flame, Books, Timer as TimerIcon } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import { Foki } from '@/components/Foki';
import { PlanCards, type PlanCardAction } from '@/components/PlanCards';
import { useAuth } from '@/context/AuthContext';
import { YEARLY_MONTHLY_EQUIVALENT, YEARLY_PRICE, formatBRL } from '@/lib/plans';

// Grades decorativas (mesma rampa de 5 niveis do heatmap real em ReportsPage),
// niveis fixos - nao vem de dados, so ilustram o recurso.
const HEATMAP_LEVEL_COLOR = [
  'var(--f-track)',
  'var(--color-accent-200)',
  'var(--color-accent-400)',
  'var(--color-accent-600)',
  'var(--color-accent-800)',
];
const PREVIEW_HEATMAP = [
  0, 1, 3, 2, 0, 1, 4, 1, 2, 4, 3, 1, 0, 2, 0, 3, 4, 4, 2, 1, 1, 2, 1, 0, 3, 4, 2, 0,
];
const STRIP_HEATMAP = [
  0, 0, 1, 0, 1, 0, 2, 1, 0, 2, 1, 2, 1, 3, 2, 1, 3, 2, 4, 3, 2, 4, 3, 4, 3, 4, 4, 3, 4,
  4, 3, 4, 4, 4, 4,
];

const SUBJECT_BARS = [
  { label: 'Cálculo', pct: 82 },
  { label: 'Química', pct: 58 },
  { label: 'Redação', pct: 34 },
];

const SUPPORTING_FEATURES = [
  {
    icon: TimerIcon,
    title: 'Timer que funciona offline',
    body: 'Ciclos de foco e pausa configuráveis, instalável como app — continua rodando mesmo sem internet.',
  },
  {
    icon: Books,
    title: 'Uma matéria por sessão',
    body: 'Cada ciclo fica ligado à matéria certa, com cor e meta semanal próprias.',
  },
  {
    icon: Flame,
    title: 'Sequência que não deixa você parar',
    body: 'A Foki acompanha sua streak — e comemora quando você bate um novo recorde.',
  },
];

function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={visible ? 'reveal reveal-visible' : 'reveal'}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

function AppPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[380px] pb-6 pl-6">
      <div className="card relative z-10 p-5" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="mb-4 flex items-center justify-between">
          <span className="font-heading text-xs text-muted">Hoje</span>
          <Foki state="focused" size={28} />
        </div>
        <div className="mb-4 flex flex-col gap-2">
          {SUBJECT_BARS.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-muted">{s.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {PREVIEW_HEATMAP.map((level, i) => (
            <div
              key={i}
              className="aspect-square rounded-[3px]"
              style={{ background: HEATMAP_LEVEL_COLOR[level] }}
            />
          ))}
        </div>
      </div>

      <div
        className="card absolute bottom-0 left-0 z-20 flex items-center gap-2 px-4 py-3"
        style={{ boxShadow: 'var(--shadow-md)', transform: 'rotate(-4deg)' }}
      >
        <Flame size={18} weight="fill" className="text-cta" />
        <div>
          <div className="font-heading text-lg leading-none tabular-nums">12</div>
          <div className="text-[10px] text-muted">dias seguidos</div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const primaryCtaTo = user ? '/timer' : '/register';
  const primaryCtaLabel = user ? 'Ir para o app' : 'Criar conta grátis';

  const free: PlanCardAction = {
    label: user ? 'Ir para o app' : 'Criar conta grátis',
    to: user ? '/timer' : '/register',
  };
  const monthly: PlanCardAction = {
    label: user ? 'Gerenciar assinatura' : 'Criar conta grátis',
    to: user ? '/subscription' : '/register',
  };
  const yearly: PlanCardAction = {
    label: user ? 'Gerenciar assinatura' : 'Criar conta grátis',
    to: user ? '/subscription' : '/register',
  };

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

      <section className="px-6 pb-16 pt-10 md:px-12 md:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="mb-5 max-w-xl text-4xl leading-[1.1] md:text-5xl">
              A maioria dos apps de pomodoro esquece o que você estudou ontem.
            </h1>
            <p className="mb-8 max-w-md text-base text-muted">
              O Pomofoca guarda cada sessão por matéria, pra você ver exatamente onde foi
              seu tempo — não só quanto tempo passou.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to={primaryCtaTo}
                className="btn btn-primary min-w-[180px] text-[15px]"
              >
                {primaryCtaLabel}
              </Link>
              {!user && (
                <Link to="/login" className="btn btn-ghost">
                  Já tenho conta
                </Link>
              )}
            </div>
          </div>
          <Reveal>
            <AppPreview />
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-16 md:px-12">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="mb-12 max-w-lg text-2xl">
              Não é só um timer. É onde seu tempo de estudo vira números.
            </h2>
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Reveal>
              <div className="card flex h-full flex-col gap-5 p-8">
                <ChartLineUp size={22} className="text-accent" />
                <h3 className="text-lg font-heading">
                  Relatórios que mostram o progresso
                </h3>
                <p className="max-w-md text-sm text-muted">
                  Heatmap anual, distribuição por matéria e evolução semanal — pra você
                  enxergar em segundos se está estudando o que precisa, ou só o que é mais
                  fácil.
                </p>
                <div className="mt-auto grid grid-cols-[repeat(35,minmax(0,1fr))] gap-[3px] pt-2">
                  {STRIP_HEATMAP.map((level, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-[2px]"
                      style={{ background: HEATMAP_LEVEL_COLOR[level] }}
                    />
                  ))}
                </div>
              </div>
            </Reveal>
            <div className="divide-y divide-divider">
              {SUPPORTING_FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 60}>
                  <div className="flex gap-4 py-5 first:pt-0">
                    <f.icon size={20} className="mt-0.5 shrink-0 text-accent" />
                    <div>
                      <h3 className="mb-1 text-[15px] font-heading">{f.title}</h3>
                      <p className="text-[13px] text-muted">{f.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 md:px-12">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="mb-2 text-center text-2xl">
              Grátis pra sempre. Premium quando o histórico importar.
            </h2>
            <p className="mb-10 text-center text-sm text-muted">
              O plano Premium libera o histórico completo por R${formatBRL(YEARLY_PRICE)}
              /ano — equivalente a R${formatBRL(YEARLY_MONTHLY_EQUIVALENT)}/mês.
            </p>
          </Reveal>
          <Reveal>
            <PlanCards free={free} monthly={monthly} yearly={yearly} />
          </Reveal>
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
