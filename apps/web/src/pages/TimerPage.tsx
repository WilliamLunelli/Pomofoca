import { ArrowCounterClockwise, Flame, SkipForward } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { usePomodoroSettings } from '@/hooks/usePomodoroSettings';
import { useSubjects } from '@/hooks/useSubjects';
import { api, ApiError } from '@/lib/api';
import type { PomodoroSession, ReportStreak, Subject } from '@/lib/types';

type Mode = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';

const CIRCUMFERENCE = 2 * Math.PI * 100;

const MODE_LABEL: Record<Mode, string> = {
  FOCUS: 'Foco',
  SHORT_BREAK: 'Pausa curta',
  LONG_BREAK: 'Pausa longa',
};

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

function durationFor(
  mode: Mode,
  settings: ReturnType<typeof usePomodoroSettings>['settings'],
): number {
  if (mode === 'FOCUS') return settings.focusMinutes * 60;
  if (mode === 'SHORT_BREAK') return settings.shortBreakMinutes * 60;
  return settings.longBreakMinutes * 60;
}

export function TimerPage() {
  const { user } = useAuth();
  const { settings } = usePomodoroSettings();
  const { subjects } = useSubjects();

  const [mode, setMode] = useState<Mode>('FOCUS');
  const [cycle, setCycle] = useState(1);
  const [remaining, setRemaining] = useState(() => settings.focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [todayFocusSeconds, setTodayFocusSeconds] = useState(0);
  const [streak, setStreak] = useState<ReportStreak | null>(null);

  const startedAtRef = useRef<Date | null>(null);
  const totalRef = useRef(durationFor('FOCUS', settings));

  useEffect(() => {
    if (!running) {
      totalRef.current = durationFor(mode, settings);
      setRemaining(totalRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    settings.focusMinutes,
    settings.shortBreakMinutes,
    settings.longBreakMinutes,
  ]);

  const loadStreak = useCallback(async () => {
    try {
      const data = await api.get<ReportStreak>('/reports/streak');
      setStreak(data);
    } catch {
      // relatório é secundário na tela do timer - falha silenciosa
    }
  }, []);

  useEffect(() => {
    loadStreak();
  }, [loadStreak]);

  const logSession = useCallback(
    async (finishedMode: Mode, elapsedSeconds: number, completed: boolean) => {
      if (elapsedSeconds < 1) return;
      const startedAt =
        startedAtRef.current ?? new Date(Date.now() - elapsedSeconds * 1000);
      try {
        await api.post<PomodoroSession>('/sessions', {
          subjectId:
            finishedMode === 'FOCUS' ? (selectedSubjectId ?? undefined) : undefined,
          type: finishedMode,
          durationSeconds: elapsedSeconds,
          completed,
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
        });
        if (finishedMode === 'FOCUS') {
          setTodayFocusSeconds((s) => s + elapsedSeconds);
          loadStreak();
        }
      } catch (err) {
        if (err instanceof ApiError)
          console.error('Falha ao registrar sessão:', err.message);
      }
    },
    [selectedSubjectId, loadStreak],
  );

  const advance = useCallback(() => {
    if (mode === 'FOCUS') {
      const nextIsLong = cycle % settings.cyclesBeforeLongBreak === 0;
      setMode(nextIsLong ? 'LONG_BREAK' : 'SHORT_BREAK');
    } else {
      if (mode === 'LONG_BREAK') setCycle(1);
      else setCycle((c) => c + 1);
      setMode('FOCUS');
    }
    startedAtRef.current = null;
  }, [mode, cycle, settings.cyclesBeforeLongBreak]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          logSession(mode, totalRef.current, true);
          advance();
          setRunning(settings.autoStartNext);
          return totalRef.current;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  function toggleRun() {
    if (!running && startedAtRef.current === null) {
      startedAtRef.current = new Date();
    }
    setRunning((r) => !r);
  }

  function skip() {
    const elapsed = totalRef.current - remaining;
    if (elapsed > 0) logSession(mode, elapsed, false);
    setRunning(false);
    advance();
  }

  function reset() {
    setRunning(false);
    startedAtRef.current = null;
    setRemaining(totalRef.current);
  }

  const elapsed = totalRef.current - remaining;
  const offset = CIRCUMFERENCE * (totalRef.current > 0 ? elapsed / totalRef.current : 0);
  const ringColor = mode === 'FOCUS' ? 'var(--color-accent)' : 'var(--f-break)';

  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-500"
        style={{
          background:
            mode === 'FOCUS'
              ? 'radial-gradient(circle at 50% 0%, var(--color-accent-100), transparent 60%)'
              : 'radial-gradient(circle at 50% 0%, rgba(78,205,196,0.12), transparent 60%)',
        }}
      />
      <div className="relative p-6 md:p-8">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <h6>{MODE_LABEL[mode]}</h6>
            <div className="text-sm text-muted">
              Ciclo {cycle} de {settings.cyclesBeforeLongBreak} · hoje{' '}
              {formatClock(todayFocusSeconds).slice(0, 5)}
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col items-center gap-6">
            <div className="relative aspect-square w-full max-w-[340px]">
              <svg viewBox="0 0 220 220" className="w-full -rotate-90">
                <circle
                  cx="110"
                  cy="110"
                  r="100"
                  fill="none"
                  stroke="var(--f-track)"
                  strokeWidth="7"
                />
                <circle
                  cx="110"
                  cy="110"
                  r="100"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={offset}
                  style={{
                    transition: 'stroke-dashoffset 400ms linear, stroke 400ms ease',
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <div className="font-heading text-[56px] leading-none tracking-tight tabular-nums">
                  {formatClock(remaining)}
                </div>
                {selectedSubjectId && (
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: subjects.find((s) => s.id === selectedSubjectId)
                          ?.color,
                      }}
                    />
                    {subjects.find((s) => s.id === selectedSubjectId)?.name}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                className="btn btn-primary min-w-[132px] text-[15px]"
                onClick={toggleRun}
              >
                {running
                  ? 'Pausar'
                  : remaining === totalRef.current
                    ? 'Começar'
                    : 'Continuar'}
              </button>
              <button
                className="btn btn-ghost btn-icon"
                title="Pular ciclo"
                onClick={skip}
              >
                <SkipForward size={17} />
              </button>
              <button
                className="btn btn-ghost btn-icon"
                title="Reiniciar"
                onClick={reset}
              >
                <ArrowCounterClockwise size={17} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h6 className="mb-4">Matéria</h6>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s: Subject) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      setSelectedSubjectId(s.id === selectedSubjectId ? null : s.id)
                    }
                    className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
                    style={{
                      borderColor:
                        s.id === selectedSubjectId ? s.color : 'var(--color-divider)',
                      background:
                        s.id === selectedSubjectId ? `${s.color}22` : 'transparent',
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </button>
                ))}
                {subjects.length === 0 && (
                  <p className="text-xs text-muted">
                    Nenhuma matéria ainda — crie uma na aba Matérias para organizar seu
                    estudo.
                  </p>
                )}
              </div>
            </div>

            {streak && (
              <div className="card flex items-center gap-2.5 p-4">
                <Flame weight="fill" size={20} className="text-cta" />
                <div className="text-[13px]">
                  <b className="font-heading font-medium">{streak.currentStreak} dias</b>{' '}
                  de sequência
                  <div className="text-[11px] text-muted">
                    recorde: {streak.recordStreak}
                  </div>
                </div>
              </div>
            )}

            {user?.plan === 'FREE' && (
              <p className="text-[11px] text-muted">
                Plano gratuito: relatórios limitados aos últimos 7 dias.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
