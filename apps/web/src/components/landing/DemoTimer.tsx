import { useEffect, useRef, useState } from 'react';

import { Foki } from '@/components/Foki';

import { DEMO_SUBJECTS } from './demoData';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const CYCLE_MS = 12_000; // o anel completa em 12s
const CELEBRATE_MS = 1_600;
const DISPLAY_SECONDS = 25 * 60; // o relogio mostra um ciclo de 25:00, so acelerado
const STATIC_REMAINING = 18 * 60 + 42;

const SIZE = 260;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SUBJECT = DEMO_SUBJECTS[0];

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DemoTimer({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [celebrating, setCelebrating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    let start = performance.now();
    let celebrateUntil = 0;
    let inView = true;
    let lastShown = -1;
    // tempo ja decorrido do ciclo atual, preservado enquanto o loop esta pausado
    let elapsedBeforePause = 0;
    let running = false;

    const paint = (p: number) => {
      ringRef.current?.setAttribute('stroke-dashoffset', String(CIRCUMFERENCE * (1 - p)));
      const remaining = Math.ceil(DISPLAY_SECONDS * (1 - p));
      if (remaining !== lastShown && clockRef.current) {
        lastShown = remaining;
        clockRef.current.textContent = formatClock(remaining);
      }
    };

    const tick = (now: number) => {
      if (celebrateUntil) {
        if (now >= celebrateUntil) {
          celebrateUntil = 0;
          start = now;
          elapsedBeforePause = 0;
          paint(0);
          setCelebrating(false);
        }
      } else {
        const p = Math.min(1, (now - start) / CYCLE_MS);
        paint(p);
        if (p >= 1) {
          celebrateUntil = now + CELEBRATE_MS;
          setCelebrating(true);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (running) return;
      running = true;
      // retoma de onde parou: reancora o inicio descontando o tempo ja decorrido
      const now = performance.now();
      start = now - elapsedBeforePause;
      if (celebrateUntil) celebrateUntil = now + CELEBRATE_MS;
      raf = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      elapsedBeforePause = celebrateUntil ? 0 : performance.now() - start;
    };
    const sync = () => {
      if (inView && !document.hidden) startLoop();
      else stopLoop();
    };

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(root);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const staticProgress = 1 - STATIC_REMAINING / DISPLAY_SECONDS;
  const fokiState = reduced ? 'idle' : celebrating ? 'celebrating' : 'focused';

  return (
    <div
      ref={rootRef}
      className={`card flex flex-col items-center justify-center gap-4 p-6 md:flex-row md:gap-6 md:p-8 ${className ?? ''}`}
      style={{ boxShadow: 'var(--shadow-lg)' }}
      role="img"
      aria-label="Demonstração de um timer pomodoro em andamento"
    >
      <div
        aria-hidden="true"
        className="relative aspect-square w-[220px] max-w-full shrink-0 md:w-[300px]"
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-full w-full -rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--landing-track)"
            strokeWidth={STROKE}
          />
          <circle
            ref={ringRef}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - (reduced ? staticProgress : 0))}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span
            ref={clockRef}
            className="font-heading text-5xl tabular-nums leading-none"
          >
            {formatClock(reduced ? STATIC_REMAINING : DISPLAY_SECONDS)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: SUBJECT.color }}
            />
            {SUBJECT.name}
          </span>
        </div>
      </div>
      <div aria-hidden="true" className="shrink-0">
        <Foki state={fokiState} size={96} />
      </div>
    </div>
  );
}
