import {
  ArrowCounterClockwise,
  CloudRain,
  Flame,
  MusicNotes,
  SkipForward,
  SpeakerSlash,
  Waveform,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Foki, type FokiState } from '@/components/Foki';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { usePomodoroSettings, type BackgroundSound } from '@/hooks/usePomodoroSettings';
import { useSubjects } from '@/hooks/useSubjects';
import { api, ApiError } from '@/lib/api';
import type {
  PomodoroSession,
  ReportBreakdown,
  ReportStreak,
  Subject,
} from '@/lib/types';

type Mode = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';

const CIRCUMFERENCE = 2 * Math.PI * 100;

const MODE_LABEL: Record<Mode, string> = {
  FOCUS: 'Foco',
  SHORT_BREAK: 'Pausa curta',
  LONG_BREAK: 'Pausa longa',
};

const SOUND_OPTIONS: { value: BackgroundSound; label: string; icon: typeof CloudRain }[] =
  [
    { value: 'rain', label: 'Chuva', icon: CloudRain },
    { value: 'lofi', label: 'Lo-fi', icon: MusicNotes },
    { value: 'white-noise', label: 'Ruído branco', icon: Waveform },
    { value: 'silence', label: 'Silêncio', icon: SpeakerSlash },
  ];

const SOUND_SRC: Partial<Record<BackgroundSound, string>> = {
  rain: '/sounds/rain.mp3',
  lofi: '/sounds/lofi.mp3',
  'white-noise': '/sounds/white-noise.mp3',
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
  const { settings, update: updateSettings } = usePomodoroSettings();
  const { subjects } = useSubjects();
  const { timerLayout, setTimerLayout } = usePreferences();

  const [mode, setMode] = useState<Mode>('FOCUS');
  const [cycle, setCycle] = useState(1);
  const [remaining, setRemaining] = useState(() => settings.focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [todayFocusSeconds, setTodayFocusSeconds] = useState(0);
  const [todayBreakdown, setTodayBreakdown] = useState<ReportBreakdown | null>(null);
  const [streak, setStreak] = useState<ReportStreak | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  const startedAtRef = useRef<Date | null>(null);
  const totalRef = useRef(durationFor('FOCUS', settings));
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const loadTodayBreakdown = useCallback(async () => {
    try {
      const data = await api.get<ReportBreakdown>('/reports/breakdown?period=today');
      setTodayBreakdown(data);
    } catch {
      // idem - card "Hoje" é secundário
    }
  }, []);

  useEffect(() => {
    loadStreak();
    loadTodayBreakdown();
  }, [loadStreak, loadTodayBreakdown]);

  // Toca o som de fundo escolhido só durante um ciclo FOCUS rodando. Os arquivos
  // ainda não existem (ver public/sounds/README.md) - o <audio> falha silenciosamente
  // até eles serem adicionados, sem quebrar o timer.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const shouldPlay =
      running && mode === 'FOCUS' && settings.backgroundSound !== 'silence';
    if (shouldPlay) {
      const src = SOUND_SRC[settings.backgroundSound];
      if (src && !audio.src.endsWith(src)) audio.src = src;
      audio.loop = true;
      audio.play().catch(() => {
        // arquivo ainda não existe ou autoplay bloqueado - sem problema
      });
    } else {
      audio.pause();
    }
  }, [running, mode, settings.backgroundSound]);

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
          loadTodayBreakdown();
        }
      } catch (err) {
        if (err instanceof ApiError)
          console.error('Falha ao registrar sessão:', err.message);
      }
    },
    [selectedSubjectId, loadStreak, loadTodayBreakdown],
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
          if (mode === 'FOCUS') {
            setCelebrating(true);
            setTimeout(() => setCelebrating(false), 1600);
          }
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

  const timerFokiState: FokiState = celebrating
    ? 'celebrating'
    : running && mode === 'FOCUS'
      ? 'focused'
      : 'idle';
  const streakFokiState: FokiState =
    streak && streak.currentStreak > 0 ? 'idle' : 'sleeping';
  const isZen = timerLayout === 'zen';

  const subjectPicker = (
    <div className="flex flex-wrap justify-center gap-2">
      {subjects.map((s: Subject) => (
        <button
          key={s.id}
          onClick={() => setSelectedSubjectId(s.id === selectedSubjectId ? null : s.id)}
          className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors"
          style={{
            borderColor: s.id === selectedSubjectId ? s.color : 'var(--color-divider)',
            background: s.id === selectedSubjectId ? `${s.color}22` : 'transparent',
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          {s.name}
        </button>
      ))}
      {subjects.length === 0 && (
        <p className="text-xs text-muted">
          Nenhuma matéria ainda — crie uma na aba Matérias para organizar seu estudo.
        </p>
      )}
    </div>
  );

  return (
    <div className="relative min-h-full">
      <audio ref={audioRef} />
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-500"
        style={{
          background:
            mode === 'FOCUS'
              ? 'radial-gradient(circle at 50% 0%, var(--color-accent-tint), transparent 60%)'
              : 'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--f-break) 10%, transparent), transparent 60%)',
        }}
      />
      <div className="relative p-6 md:p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
          <div>
            <h6>{MODE_LABEL[mode]}</h6>
            <div className="text-sm text-muted">
              Ciclo {cycle} de {settings.cyclesBeforeLongBreak} · hoje{' '}
              {formatClock(todayFocusSeconds).slice(0, 5)}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setTimerLayout('zen')}
              className="rounded-sm border px-2.5 py-1.5 text-[11px] transition-colors"
              style={{
                borderColor: isZen ? 'var(--color-accent)' : 'var(--color-divider)',
                background: isZen ? 'var(--color-accent-tint)' : 'transparent',
                color: isZen ? 'var(--color-accent)' : 'var(--color-text)',
              }}
            >
              Zen
            </button>
            <button
              onClick={() => setTimerLayout('panel')}
              className="rounded-sm border px-2.5 py-1.5 text-[11px] transition-colors"
              style={{
                borderColor: !isZen ? 'var(--color-accent)' : 'var(--color-divider)',
                background: !isZen ? 'var(--color-accent-tint)' : 'transparent',
                color: !isZen ? 'var(--color-accent)' : 'var(--color-text)',
              }}
            >
              Painel
            </button>
          </div>
        </div>

        <div
          className={
            isZen
              ? 'flex justify-center'
              : 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]'
          }
        >
          <div className="flex flex-col items-center gap-6">
            <Foki state={timerFokiState} size={56} />
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

            {isZen && <div className="w-full max-w-sm">{subjectPicker}</div>}
          </div>

          {!isZen && (
            <div className="flex flex-col gap-6">
              <div>
                <h6 className="mb-4">Matéria</h6>
                {subjectPicker}
              </div>

              {todayBreakdown && todayBreakdown.subjects.length > 0 && (
                <div className="card p-6">
                  <h6 className="mb-4">Hoje</h6>
                  <div className="flex flex-col gap-3">
                    {todayBreakdown.subjects.map((s) => (
                      <div key={s.subjectId ?? 'none'}>
                        <div className="mb-1 flex justify-between text-[13px]">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: s.color ?? 'var(--f-muted)' }}
                            />
                            {s.name}
                          </span>
                          <span className="tabular-nums text-muted">
                            {s.minutes < 60
                              ? `${s.minutes}m`
                              : `${Math.floor(s.minutes / 60)}h ${s.minutes % 60}m`}
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-track">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${s.percentage}%`,
                              background: s.color ?? 'var(--f-muted)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card p-6">
                <h6 className="mb-4">Som de fundo</h6>
                <div className="flex flex-col gap-1">
                  {SOUND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSettings('backgroundSound', opt.value)}
                      className="flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-[13px] transition-colors"
                      style={
                        settings.backgroundSound === opt.value
                          ? {
                              background: 'var(--color-accent-tint)',
                              color: 'var(--color-accent)',
                            }
                          : undefined
                      }
                    >
                      <opt.icon size={16} />
                      {opt.label}
                      {opt.value !== 'silence' && !SOUND_SRC[opt.value] && (
                        <span className="ml-auto text-[10px] text-muted">em breve</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {streak && (
                <div className="card flex items-center gap-3 p-4">
                  <Foki state={streakFokiState} size={40} />
                  <Flame weight="fill" size={20} className="text-cta" />
                  <div className="text-[13px]">
                    <b className="font-heading font-medium">
                      {streak.currentStreak} dias
                    </b>{' '}
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
          )}
        </div>
      </div>
    </div>
  );
}
