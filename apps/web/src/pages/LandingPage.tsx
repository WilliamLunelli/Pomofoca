import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChartLineUp, Flame, Books, Timer as TimerIcon } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import { Foki } from '@/components/Foki';
import { DemoHeatmap } from '@/components/landing/DemoHeatmap';
import { DemoTimer } from '@/components/landing/DemoTimer';
import { LandingHeader } from '@/components/landing/LandingHeader';
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
const STRIP_HEATMAP = [
  0, 0, 1, 0, 1, 0, 2, 1, 0, 2, 1, 2, 1, 3, 2, 1, 3, 2, 4, 3, 2, 4, 3, 4, 3, 4, 4, 3, 4,
  4, 3, 4, 4, 4, 4,
];

const SUPPORTING_FEATURES = [
  {
    icon: TimerIcon,
    title: 'Timer que funciona offline',
    body: 'Ciclos de foco e pausa configuráveis, instalável como app, continua rodando mesmo sem internet.',
  },
  {
    icon: Books,
    title: 'Uma matéria por sessão',
    body: 'Cada ciclo fica ligado à matéria certa, com cor e meta semanal próprias.',
  },
  {
    icon: Flame,
    title: 'Sequência que não deixa você parar',
    body: 'A Foki acompanha sua streak e comemora quando você bate um novo recorde.',
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

export function LandingPage() {
  const { user } = useAuth();
  const primaryCtaTo = user ? '/timer' : '/register';
  const primaryCtaLabel = user ? 'Abrir o timer' : 'Criar conta grátis';

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
      <LandingHeader loggedIn={!!user} />

      <section className="flex min-h-[100dvh] items-center px-6 pb-16 pt-24 md:px-12">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-8 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <h1
              className="hero-enter mb-5 leading-[1.1]"
              style={{ fontSize: 'var(--text-display)', textWrap: 'balance' }}
            >
              A maioria dos apps de pomodoro esquece o que você estudou ontem.
            </h1>
            <p
              className="hero-enter hero-lead mb-8 max-w-md text-base"
              style={{ '--hero-delay': '80ms' } as CSSProperties}
            >
              O Pomofoca registra cada sessão por matéria. Você vê para onde foi seu
              tempo, não só quanto passou.
            </p>
            <div
              className="hero-enter hero-cta flex flex-wrap items-center gap-3"
              style={{ '--hero-delay': '160ms' } as CSSProperties}
            >
              <Link to={primaryCtaTo} className="btn btn-primary min-w-[180px] text-[15px]">
                {primaryCtaLabel}
              </Link>
              {!user && (
                <Link to="/login" className="btn btn-ghost">
                  Já tenho conta
                </Link>
              )}
            </div>
          </div>
          <div
            className="hero-enter relative md:pb-36 md:pr-10"
            style={{ '--hero-delay': '240ms' } as CSSProperties}
          >
            <div
              aria-hidden="true"
              className="hero-glow pointer-events-none absolute -inset-x-6 -inset-y-10 md:-inset-x-12 md:-inset-y-16"
            />
            <DemoTimer className="relative z-10 w-full md:w-fit md:max-w-full" />
            <div
              className="card relative z-20 mt-4 w-full p-4 md:absolute md:bottom-0 md:right-0 md:mt-0 md:w-[540px] md:p-5"
              style={{ boxShadow: 'var(--shadow-lg)' }}
            >
              <DemoHeatmap weeks={30} />
            </div>
          </div>
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
                  Heatmap anual, distribuição por matéria e evolução semanal, pra você
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
              /ano, equivalente a R${formatBRL(YEARLY_MONTHLY_EQUIVALENT)}/mês.
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
          Pomofoca: feito para quem estuda de verdade.
        </p>
      </footer>
    </div>
  );
}
