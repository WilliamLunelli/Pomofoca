import {
  ArrowCounterClockwise,
  Check,
  CloudRain,
  Flame,
  MusicNotes,
  SkipForward,
  SpeakerSlash,
  Waveform,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CountUp } from '@/components/CountUp';
import { Foki, type FokiState } from '@/components/Foki';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { usePomodoroSettings, type BackgroundSound } from '@/hooks/usePomodoroSettings';
import { useSubjects } from '@/hooks/useSubjects';
import { useSubjectTasks } from '@/hooks/useSubjectTasks';
import {
  useTimerSync,
  type TimerSyncEvent,
  type TimerSyncPayload,
} from '@/hooks/useTimerSync';
import { api, ApiError } from '@/lib/api';
import type {
  ActiveTimerState,
  PomodoroSession,
  ReportBreakdown,
  ReportStreak,
  Subject,
} from '@pomofoca/shared';

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

// Mesma convencao de ReportsPage::formatMinutes - omite "0h" quando o total fica
// abaixo de uma hora, pra nao poluir o card "Hoje" com "0h 12m" o dia todo.
function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
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
  const reducedMotion = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [todayFocusSeconds, setTodayFocusSeconds] = useState(0);
  const [todayBreakdown, setTodayBreakdown] = useState<ReportBreakdown | null>(null);
  const [streak, setStreak] = useState<ReportStreak | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  // Foki triste por ~1.2s ao pular um ciclo FOCUS antes do fim
  const [skipSad, setSkipSad] = useState(false);
  const skipSadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebratingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (skipSadTimerRef.current) clearTimeout(skipSadTimerRef.current);
      if (celebratingTimerRef.current) clearTimeout(celebratingTimerRef.current);
    },
    [],
  );

  const startedAtRef = useRef<Date | null>(null);
  const totalRef = useRef(durationFor('FOCUS', settings));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Espelha selectedSubjectId pro tick do setInterval (que so re-cria em [running,
  // mode], entao nao pega o valor mais recente via closure direto).
  const selectedSubjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedSubjectIdRef.current = selectedSubjectId;
  });

  const { tasks: subjectTasks, toggleTask: toggleSubjectTask } =
    useSubjectTasks(selectedSubjectId);
  const pendingTasks = subjectTasks.filter((t) => !t.completed);
  const activeTask = subjectTasks.find((t) => t.id === selectedTaskId) ?? null;

  // Tarefa ativa e por materia - trocar de materia (ou tirar a selecao) limpa a
  // tarefa escolhida, senao ficaria uma tarefa de outra materia "ativa" sem sentido.
  useEffect(() => {
    setSelectedTaskId(null);
  }, [selectedSubjectId]);

  const isPremium = user?.plan === 'PREMIUM';

  function handleRemoteTimerEvent(_event: TimerSyncEvent, payload: TimerSyncPayload) {
    setMode(payload.mode);
    setCycle(payload.cycle);
    setSelectedSubjectId(payload.subjectId);
    totalRef.current = payload.totalSeconds;
    setRemaining(payload.remainingSeconds);
    setRunning(payload.status === 'running');
    startedAtRef.current =
      payload.status === 'running'
        ? new Date(Date.now() - (payload.totalSeconds - payload.remainingSeconds) * 1000)
        : null;
  }

  const { emit: emitTimerSync } = useTimerSync(isPremium, handleRemoteTimerEvent);

  // Hidrata com o estado de outro dispositivo que ja esteja rodando (ex: abriu o
  // app no celular com o timer ja ativo no desktop) - antes mesmo do socket conectar.
  useEffect(() => {
    if (!isPremium) return;
    api
      .get<ActiveTimerState | null>('/sessions/active')
      .then((active) => {
        if (!active) return;
        let remainingSeconds = active.remainingSeconds;
        if (active.status === 'running') {
          const elapsedSinceUpdate = Math.floor(
            (Date.now() - new Date(active.updatedAt).getTime()) / 1000,
          );
          remainingSeconds = Math.max(0, active.remainingSeconds - elapsedSinceUpdate);
        }
        const stillRunning = active.status === 'running' && remainingSeconds > 0;
        setMode(active.mode);
        setCycle(active.cycle);
        setSelectedSubjectId(active.subjectId);
        totalRef.current = active.totalSeconds;
        setRemaining(remainingSeconds);
        setRunning(stillRunning);
        startedAtRef.current = stillRunning
          ? new Date(Date.now() - (active.totalSeconds - remainingSeconds) * 1000)
          : null;
      })
      .catch(() => {
        // sincronizacao e um extra - falha silenciosa, timer local continua ok
      });
  }, [isPremium]);

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
          taskId: finishedMode === 'FOCUS' ? (selectedTaskId ?? undefined) : undefined,
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
    [selectedSubjectId, selectedTaskId, loadStreak, loadTodayBreakdown],
  );

  const advance = useCallback((): { nextMode: Mode; nextCycle: number } => {
    let nextMode: Mode;
    let nextCycle = cycle;
    if (mode === 'FOCUS') {
      const nextIsLong = cycle % settings.cyclesBeforeLongBreak === 0;
      nextMode = nextIsLong ? 'LONG_BREAK' : 'SHORT_BREAK';
    } else {
      nextCycle = mode === 'LONG_BREAK' ? 1 : cycle + 1;
      nextMode = 'FOCUS';
    }
    setMode(nextMode);
    setCycle(nextCycle);
    startedAtRef.current = null;
    return { nextMode, nextCycle };
  }, [mode, cycle, settings.cyclesBeforeLongBreak]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          logSession(mode, totalRef.current, true);
          if (mode === 'FOCUS') {
            setCelebrating(true);
            if (celebratingTimerRef.current) clearTimeout(celebratingTimerRef.current);
            celebratingTimerRef.current = setTimeout(() => setCelebrating(false), 1600);
          }
          const { nextMode, nextCycle } = advance();
          const shouldAutoStart = settings.autoStartNext;
          setRunning(shouldAutoStart);
          // totalRef.current so eh corrigido pro novo modo por um efeito separado (e
          // so quando !running) - usa durationFor aqui pra nao propagar um valor
          // desatualizado pros outros dispositivos, mesmo que o estado local (que ja
          // se comporta assim hoje) so se corrija no proximo render.
          const nextTotal = durationFor(nextMode, settings);
          emitTimerSync(shouldAutoStart ? 'timer:start' : 'timer:finish', {
            subjectId: selectedSubjectIdRef.current,
            mode: nextMode,
            cycle: nextCycle,
            remainingSeconds: nextTotal,
            totalSeconds: nextTotal,
            status: shouldAutoStart ? 'running' : 'paused',
          });
          return totalRef.current;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  function toggleRun() {
    const wasFreshStart = !running && remaining === totalRef.current;
    if (!running && startedAtRef.current === null) {
      startedAtRef.current = new Date();
    }
    const nextRunning = !running;
    setRunning(nextRunning);
    emitTimerSync(
      nextRunning ? (wasFreshStart ? 'timer:start' : 'timer:resume') : 'timer:pause',
      {
        subjectId: selectedSubjectId,
        mode,
        cycle,
        remainingSeconds: remaining,
        totalSeconds: totalRef.current,
        status: nextRunning ? 'running' : 'paused',
      },
    );
  }

  function clearFokiTimers() {
    if (celebratingTimerRef.current) clearTimeout(celebratingTimerRef.current);
    celebratingTimerRef.current = null;
    if (skipSadTimerRef.current) clearTimeout(skipSadTimerRef.current);
    skipSadTimerRef.current = null;
    setCelebrating(false);
    setSkipSad(false);
  }

  function skip() {
    const elapsed = totalRef.current - remaining;
    clearFokiTimers();
    if (mode === 'FOCUS' && remaining > 0) {
      setSkipSad(true);
      skipSadTimerRef.current = setTimeout(() => setSkipSad(false), 1200);
    }
    if (elapsed > 0) logSession(mode, elapsed, false);
    setRunning(false);
    const { nextMode, nextCycle } = advance();
    const nextTotal = durationFor(nextMode, settings);
    emitTimerSync('timer:finish', {
      subjectId: selectedSubjectId,
      mode: nextMode,
      cycle: nextCycle,
      remainingSeconds: nextTotal,
      totalSeconds: nextTotal,
      status: 'paused',
    });
  }

  function reset() {
    clearFokiTimers();
    setRunning(false);
    startedAtRef.current = null;
    setRemaining(totalRef.current);
    emitTimerSync('timer:pause', {
      subjectId: selectedSubjectId,
      mode,
      cycle,
      remainingSeconds: totalRef.current,
      totalSeconds: totalRef.current,
      status: 'paused',
    });
  }

  const elapsed = totalRef.current - remaining;
  const offset = CIRCUMFERENCE * (totalRef.current > 0 ? elapsed / totalRef.current : 0);
  const ringColor = mode === 'FOCUS' ? 'var(--color-accent)' : 'var(--f-break)';
  // Anel suave (1000ms linear) so enquanto roda e avanca; em saltos (reset, troca de
  // modo/ciclo, offset diminuindo) a transicao some pra nao girar ao contrario.
  const prevOffsetRef = useRef(offset);
  const ringJump = offset < prevOffsetRef.current;
  useEffect(() => {
    prevOffsetRef.current = offset;
  }, [offset]);
  const ringTransition =
    reducedMotion || !running || ringJump
      ? 'stroke var(--motion-slow) ease'
      : 'stroke-dashoffset 1000ms linear, stroke var(--motion-slow) ease';

  const timerFokiState: FokiState = celebrating
    ? 'celebrating'
    : skipSad
      ? 'sad'
      : running && mode === 'FOCUS'
        ? 'focused'
        : !running && elapsed > 0
          ? 'curious'
          : 'idle';
  const streakFokiState: FokiState =
    streak && streak.currentStreak > 0 ? 'idle' : 'sleeping';
  const isZen = timerLayout === 'zen';

  const subjectPicker = (
    <div className="flex flex-wrap justify-center gap-2">
      {subjects.map((s: Subject) => (
        <button
          key={s.id}
          onClick={() => {
            const next = s.id === selectedSubjectId ? null : s.id;
            setSelectedSubjectId(next);
            emitTimerSync('timer:subjectChange', {
              subjectId: next,
              mode,
              cycle,
              remainingSeconds: remaining,
              totalSeconds: totalRef.current,
              status: running ? 'running' : 'paused',
            });
          }}
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
        className={`pointer-events-none absolute inset-0 transition-colors duration-500${
          running && mode === 'FOCUS' ? ' glow-pulse' : ''
        }`}
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
              className="seg-btn rounded-sm border px-2.5 py-1.5 text-[11px]"
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
              className="seg-btn rounded-sm border px-2.5 py-1.5 text-[11px]"
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
          {/* max-w fixo aqui (nao so no anel abaixo) - o clamp do anel usa vw, que
              ignora a coluna de 320px da sidebar no layout Painel. Sem este teto
              compartilhado, o Zen (sem sidebar disputando espaco) deixava o anel
              crescer mais que no Painel na MESMA largura de janela. */}
          <div className="flex w-full max-w-[640px] flex-col items-center gap-6">
            {/* sobrepoe a borda superior do anel (margem negativa), sem tocar o relogio */}
            <div className="pointer-events-none relative z-10 -mb-[44px]">
              <Foki state={timerFokiState} size={80} />
            </div>
            <div
              className="relative aspect-square w-full"
              style={{ maxWidth: 'clamp(340px, 30vw, 560px)' }}
            >
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
                  style={{ transition: ringTransition }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <div
                  key={running ? 'running' : 'paused'}
                  className="clock-pop font-heading leading-none tracking-tight tabular-nums"
                  style={{ fontSize: 'clamp(56px, 5vw, 92px)' }}
                >
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
                {activeTask && (
                  <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-accent">
                    {activeTask.title}
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
            <div className="stagger flex flex-col gap-6">
              <div>
                <h6 className="mb-4">Matéria</h6>
                {subjectPicker}
              </div>

              {selectedSubjectId && pendingTasks.length > 0 && (
                <div className="card p-6">
                  <h6 className="mb-4">Tarefa ativa</h6>
                  <div className="flex flex-col gap-1.5">
                    {pendingTasks.map((task) => {
                      const isActive = task.id === selectedTaskId;
                      return (
                        <div key={task.id} className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedTaskId(isActive ? null : task.id)}
                            className="flex-1 rounded-sm px-2.5 py-1.5 text-left text-[13px] transition-colors duration-[var(--motion-base)]"
                            style={
                              isActive
                                ? {
                                    background: 'var(--color-accent-tint)',
                                    color: 'var(--color-accent)',
                                  }
                                : undefined
                            }
                          >
                            {task.title}
                          </button>
                          {isActive && (
                            <button
                              className="btn btn-ghost btn-icon flex-none"
                              title="Marcar como concluída"
                              onClick={() => {
                                toggleSubjectTask(task.id, true);
                                setSelectedTaskId(null);
                              }}
                            >
                              <Check size={15} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {subjects.length > 0 && (
                <div className="card p-6">
                  <h6 className="mb-4">Hoje</h6>
                  <div className="flex flex-col gap-3">
                    {subjects.map((s) => {
                      const minutesToday =
                        todayBreakdown?.subjects.find((b) => b.subjectId === s.id)
                          ?.minutes ?? 0;
                      // Meta semanal como fatia proporcional do dia (meta/7) - nunca
                      // um valor fixo arbitrario. Sem meta definida, so mostra o
                      // tempo, sem barra (nao ha referencia pra comparar contra).
                      const goalProgress = s.weeklyGoalMinutes
                        ? Math.min((minutesToday / (s.weeklyGoalMinutes / 7)) * 100, 100)
                        : null;
                      return (
                        <div key={s.id}>
                          <div className="mb-1 flex justify-between text-[13px]">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: s.color }}
                              />
                              {s.name}
                            </span>
                            <span className="tabular-nums text-muted">
                              {formatMinutes(minutesToday)}
                            </span>
                          </div>
                          {goalProgress !== null && (
                            <div className="h-1 overflow-hidden rounded-full bg-track">
                              <div
                                className="bar-grow h-full rounded-full"
                                style={{ width: `${goalProgress}%`, background: s.color }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                  <Flame
                    weight="fill"
                    size={20}
                    className={`text-cta${streak.currentStreak > 0 ? ' flame-flicker' : ''}`}
                  />
                  <div className="text-[13px]">
                    <b className="font-heading font-medium">
                      <CountUp value={streak.currentStreak} /> dias
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
