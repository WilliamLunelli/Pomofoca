import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Books,
  CalendarBlank,
  ChartLineUp,
  Flame,
  Lightbulb,
  Timer as TimerIcon,
  WifiSlash,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import { Foki } from '@/components/Foki';
import { DemoHeatmap } from '@/components/landing/DemoHeatmap';
import { DemoSubjects } from '@/components/landing/DemoSubjects';
import { DemoTimer } from '@/components/landing/DemoTimer';
import { DemoWeek } from '@/components/landing/DemoWeek';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { useReducedMotion } from '@/components/landing/useReducedMotion';
import { PlanCards, type PlanCardAction } from '@/components/PlanCards';
import { useAuth } from '@/context/AuthContext';
import { YEARLY_MONTHLY_EQUIVALENT, YEARLY_PRICE, formatBRL } from '@/lib/plans';

const STEPS = [
  {
    icon: Books,
    title: 'Escolha a matéria',
    body: 'Cada ciclo fica ligado a uma matéria, com cor e meta semanal.',
  },
  {
    icon: TimerIcon,
    title: 'Foque no ciclo',
    body: 'Foco e pausa no seu ritmo, sem distração e sem precisar de internet.',
  },
  {
    icon: ChartLineUp,
    title: 'Veja onde foi seu tempo',
    body: 'Relatórios por matéria e por período mostram o que você realmente estudou.',
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

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={[visible ? 'reveal reveal-visible' : 'reveal', className]
        .filter(Boolean)
        .join(' ')}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const fokiCelebrate = reduced ? 'idle' : 'celebrating';
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

      {/* Para onde foi seu tempo: bento de 4 celulas (2+1 / 2+1 no desktop) */}
      <section className="px-6 py-20 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="mb-3 max-w-lg text-2xl">Para onde foi seu tempo</h2>
            <p className="landing-muted mb-10 max-w-xl text-sm">
              Cada sessão vira dado: ano inteiro, matérias, padrões e sequência no mesmo
              lugar.
            </p>
          </Reveal>
          <div className="grid gap-4 lg:grid-cols-3">
            <Reveal className="lg:col-span-2">
              <div className="card flex h-full flex-col gap-4 p-6">
                <DemoHeatmap weeks={26} className="md:hidden" />
                <DemoHeatmap className="hidden md:block" />
                <p className="landing-muted mt-auto text-sm">
                  Um ano de estudo num olhar só.
                </p>
              </div>
            </Reveal>
            <Reveal delay={60}>
              <div className="card flex h-full flex-col gap-4 p-6">
                <h3 className="text-[15px] font-heading">Horas por matéria</h3>
                <DemoSubjects />
              </div>
            </Reveal>
            <Reveal className="lg:col-span-2" delay={60}>
              <div
                className="flex h-full flex-col gap-3 rounded-[var(--radius-md)] border border-divider p-6"
                style={{ background: 'var(--color-accent-tint)' }}
              >
                <div className="flex items-center gap-2">
                  <Lightbulb size={20} weight="fill" className="text-accent" />
                  <span className="tag tag-accent landing-tag">Premium</span>
                </div>
                <p className="text-lg leading-relaxed">
                  Você planejou Cálculo às terças, 14:00-16:00, mas estudou por volta de
                  20h-22h em 3 das últimas 4 semanas. Que tal ajustar o bloco?
                </p>
                <p className="landing-muted mt-auto text-xs">Baseado em 41 sessões</p>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div
                className="flex h-full items-center justify-between gap-4 rounded-[var(--radius-md)] border border-divider p-6"
                style={{ background: 'var(--landing-wash)' }}
              >
                <div>
                  <div className="landing-muted mb-1 flex items-center gap-1.5 text-sm">
                    <Flame size={18} weight="fill" className="text-accent" />
                    Sequência
                  </div>
                  <div className="font-heading text-5xl leading-none tabular-nums">23</div>
                  <div className="landing-muted mt-1 text-sm">dias seguidos</div>
                </div>
                <Foki state={fokiCelebrate} size={72} />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Como funciona: 3 passos num trilho (horizontal no desktop, vertical no mobile) */}
      <section className="px-6 py-20 md:px-12">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="mb-14 text-center text-2xl">Como funciona</h2>
          </Reveal>
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute bottom-6 left-6 top-6 w-px md:bottom-auto md:left-[16.67%] md:right-[16.67%] md:top-6 md:h-px md:w-auto"
              style={{ background: 'var(--landing-rail)' }}
            />
          <ol className="relative m-0 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <Reveal delay={i * 80}>
                  <div className="flex gap-4 md:flex-col md:items-center md:text-center">
                    <div
                      className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-divider bg-surface"
                      style={{ boxShadow: 'var(--shadow-sm)' }}
                    >
                      <s.icon size={22} className="text-accent" />
                    </div>
                    <div className="md:max-w-[240px]">
                      <h3 className="mb-1 text-base font-heading">{s.title}</h3>
                      <p className="landing-muted text-[13px]">{s.body}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
          </div>
        </div>
      </section>

      {/* Diferenciais: texto a esquerda, demonstracao a direita (assimetrico) */}
      <section className="px-6 py-20 md:px-12">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div className="flex flex-col gap-10">
            <h2 className="sr-only">Mais diferenciais</h2>
            <Reveal>
              <div className="flex gap-4">
                <WifiSlash size={22} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <h3 className="mb-1 text-lg font-heading">Funciona offline</h3>
                  <p className="landing-muted text-sm">
                    Instale como app no celular ou no computador. Sem internet, o timer
                    continua rodando normalmente.
                  </p>
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="flex gap-4">
                <CalendarBlank size={22} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <h3 className="mb-1 flex flex-wrap items-center gap-2 text-lg font-heading">
                    Rotina da semana
                    <span className="tag tag-outline">No plano grátis</span>
                  </h3>
                  <p className="landing-muted text-sm">
                    Monte uma grade semanal com blocos por matéria e compare o plano com o
                    que você de fato estudou.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <div className="card p-5 md:p-6" style={{ boxShadow: 'var(--shadow-md)' }}>
              <DemoWeek />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-20 md:px-12">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="mb-2 text-center text-2xl">
              Grátis para sempre. Premium quando o histórico importar.
            </h2>
            <p className="landing-muted mb-10 text-center text-sm">
              O plano Premium libera o histórico completo por R${formatBRL(YEARLY_PRICE)}
              /ano, equivalente a R${formatBRL(YEARLY_MONTHLY_EQUIVALENT)}/mês.
            </p>
          </Reveal>
          <Reveal>
            <PlanCards free={free} monthly={monthly} yearly={yearly} />
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-8 md:px-12">
        <Reveal>
          <div
            className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-[var(--radius-lg)] border border-divider px-6 py-12 text-center md:flex-row md:justify-between md:px-12 md:text-left"
            style={{ background: 'var(--landing-wash)' }}
          >
            <div className="flex flex-col items-center gap-5 md:flex-row md:gap-8">
              <Foki state={fokiCelebrate} size={88} />
              <h2 className="text-2xl">Seu próximo ciclo começa agora.</h2>
            </div>
            <Link to={primaryCtaTo} className="btn btn-primary min-w-[180px] text-[15px]">
              {primaryCtaLabel}
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="mt-12 border-t border-divider px-6 py-10 md:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-5 md:flex-row">
          <div className="flex flex-col items-center gap-1 md:items-start">
            <div className="flex items-center gap-2">
              <TimerIcon weight="fill" size={20} className="text-accent" />
              <span className="font-heading text-lg tracking-tight">Pomofoca</span>
            </div>
            <p className="text-xs text-muted">
              Pomofoca, feito para quem estuda de verdade.
            </p>
          </div>
          {!user && (
            <nav className="flex items-center gap-4 text-sm">
              <Link to="/login" className="text-muted hover:text-text">
                Entrar
              </Link>
              <Link to="/register" className="text-muted hover:text-text">
                Criar conta
              </Link>
            </nav>
          )}
        </div>
      </footer>
    </div>
  );
}
