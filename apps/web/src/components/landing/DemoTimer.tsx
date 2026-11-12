import { useEffect, useState } from 'react';

import { Foki } from '@/components/Foki';

import { DEMO_SUBJECTS } from './demoData';
import { useReducedMotion } from './useReducedMotion';

const CYCLE_MS = 12_000; // o anel completa em 12s
const CELEBRATE_MS = 1_600;
const DISPLAY_SECONDS = 25 * 60; // o relogio mostra um ciclo de 25:00, so acelerado
const STATIC_REMAINING = 18 * 60 + 42;

const SIZE = 220;
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
  const [progress, setProgress] = useState(0);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let start = performance.now();
    let celebrateUntil = 0;

    const tick = (now: number) => {
      if (celebrateUntil) {
        if (now >= celebrateUntil) {
          celebrateUntil = 0;
          start = now;
          setCelebrating(false);
          setProgress(0);
        }
      } else {
        const p = Math.min(1, (now - start) / CYCLE_MS);
        setProgress(p);
        if (p >= 1) {
          celebrateUntil = now + CELEBRATE_MS;
          setCelebrating(true);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const shownProgress = reduced ? 1 - STATIC_REMAINING / DISPLAY_SECONDS : progress;
  const remaining = reduced
    ? STATIC_REMAINING
    : Math.ceil(DISPLAY_SECONDS * (1 - shownProgress));
  const fokiState = reduced ? 'idle' : celebrating ? 'celebrating' : 'focused';

  return (
    <div
      className={`card flex items-center gap-5 p-6 ${className ?? ''}`}
      style={{ boxShadow: 'var(--shadow-lg)' }}
      role="img"
      aria-label="Demonstração de um timer pomodoro em andamento"
    >
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--f-track)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - shownProgress)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="font-heading text-5xl tabular-nums leading-none">
            {formatClock(remaining)}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: SUBJECT.color }} />
            {SUBJECT.name}
          </span>
        </div>
      </div>
      <Foki state={fokiState} size={72} className="hidden sm:block" />
    </div>
  );
}
