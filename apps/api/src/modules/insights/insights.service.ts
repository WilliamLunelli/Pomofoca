import { prisma } from '../../config/database';
import { localDateSurrogate } from '../../shared/utils/period';

// Piso geral - nenhum insight e gerado (nem parcialmente) abaixo disso. Amostra
// pequena gera desconfianca no produto ("ele inventou isso com 3 dias de dado?").
const MIN_DAYS_OF_HISTORY = 14;
const MIN_COMPLETED_SESSIONS = 20;

const PEAK_HOURS_LOOKBACK_DAYS = 60;
const PEAK_HOURS_MIN_SESSIONS_IN_BLOCK = 5;
// Sem isso, uma diferenca de 1% (ruido, nao padrao real) passava como "insight" -
// visto em dado real: "completa 1% mais pomodoros entre 4h-6h" nao diz nada.
const MIN_MEANINGFUL_DIFF_PERCENT = 10;

const WEAK_DAY_LOOKBACK_WEEKS = 8;
const WEAK_DAY_MIN_WEEKS_WITH_DATA = 4;

const NEGLECTED_SUBJECT_LOOKBACK_DAYS = 14;
const NEGLECTED_SUBJECT_MIN_SUBJECT_AGE_DAYS = 14;
const NEGLECTED_SUBJECT_RATIO_THRESHOLD = 0.6;

const INTERRUPTION_LOOKBACK_DAYS = 60;
const INTERRUPTION_MIN_TOTAL_INTERRUPTED = 10;
const INTERRUPTION_MIN_POINTS_GAP = 20;

export interface InsightItem {
  type: 'peak_hours' | 'weak_day' | 'neglected_subject' | 'interruption_pattern';
  title: string;
  description: string;
  dataPoints: number;
}

export interface SessionRecord {
  startedAt: Date;
  completed: boolean;
  subjectId: string | null;
}

export interface DailyStatRecord {
  date: Date;
  focusSeconds: number;
  bySubject: Record<string, { seconds: number; completed: number }>;
}

export interface SubjectRecord {
  id: string;
  name: string;
  weeklyGoalMinutes: number;
  createdAt: Date;
}

const BLOCK_HOURS = 2;
const BLOCK_LABELS = [
  '0h-2h',
  '2h-4h',
  '4h-6h',
  '6h-8h',
  '8h-10h',
  '10h-12h',
  '12h-14h',
  '14h-16h',
  '16h-18h',
  '18h-20h',
  '20h-22h',
  '22h-24h',
];

function localHour(instant: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(instant);
  return Number(formatted) % 24;
}

function pctRelative(value: number, baseline: number): number {
  if (baseline === 0) return 0;
  return Math.round(((value - baseline) / baseline) * 100);
}

/**
 * Horario de pico: bloco de 2h (fuso local) com a maior taxa de conclusao, desde
 * que tenha pelo menos PEAK_HOURS_MIN_SESSIONS_IN_BLOCK sessoes e a taxa seja
 * genuinamente melhor que a media geral (senao "pico" nao significa nada).
 */
export function computePeakHours(
  sessions: SessionRecord[],
  timezone: string,
): InsightItem | null {
  if (sessions.length === 0) return null;

  const blocks = Array.from({ length: 12 }, () => ({ completed: 0, interrupted: 0 }));
  let totalCompleted = 0;
  let totalInterrupted = 0;

  for (const session of sessions) {
    const hour = localHour(session.startedAt, timezone);
    const blockIndex = Math.floor(hour / BLOCK_HOURS);
    if (session.completed) {
      blocks[blockIndex].completed += 1;
      totalCompleted += 1;
    } else {
      blocks[blockIndex].interrupted += 1;
      totalInterrupted += 1;
    }
  }

  const overallRate = totalCompleted / (totalCompleted + totalInterrupted);
  if (!Number.isFinite(overallRate) || overallRate === 0) return null;

  let bestIndex = -1;
  let bestRate = -1;
  let bestCount = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const total = blocks[i].completed + blocks[i].interrupted;
    if (total < PEAK_HOURS_MIN_SESSIONS_IN_BLOCK) continue;
    const rate = blocks[i].completed / total;
    if (rate > bestRate) {
      bestRate = rate;
      bestIndex = i;
      bestCount = total;
    }
  }
  if (bestIndex === -1) return null;

  const diff = pctRelative(bestRate, overallRate);
  if (diff < MIN_MEANINGFUL_DIFF_PERCENT) return null;

  return {
    type: 'peak_hours',
    title: 'Seu horário de pico',
    description: `Você completa ${diff}% mais pomodoros entre ${BLOCK_LABELS[bestIndex]}.`,
    dataPoints: bestCount,
  };
}

const WEEKDAY_NAMES = [
  'domingos',
  'segundas',
  'terças',
  'quartas',
  'quintas',
  'sextas',
  'sábados',
];

/**
 * Dia da semana mais fraco: media de minutos estudados por dia (contando dias sem
 * nenhuma sessao como 0 - um dia sempre pulado deve puxar a media pra baixo),
 * comparado contra a media dos outros 6 dias.
 */
export function computeWeakDay(
  dailyStats: DailyStatRecord[],
  now: Date,
): InsightItem | null {
  const windowDays = WEAK_DAY_LOOKBACK_WEEKS * 7;
  const statByDateKey = new Map(
    dailyStats.map((stat) => [stat.date.getTime(), stat.focusSeconds]),
  );

  // Um "slot" por dia de calendario nas ultimas WEAK_DAY_LOOKBACK_WEEKS semanas,
  // incluindo dias sem nenhum dado (focusSeconds = 0).
  const weekdayTotals = Array.from({ length: 7 }, () => ({
    sum: 0,
    occurrences: 0,
    withData: 0,
  }));
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  for (let i = 0; i < windowDays; i += 1) {
    const day = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
    const weekday = day.getUTCDay();
    const seconds = statByDateKey.get(day.getTime()) ?? 0;
    weekdayTotals[weekday].sum += seconds;
    weekdayTotals[weekday].occurrences += 1;
    if (seconds > 0) weekdayTotals[weekday].withData += 1;
  }

  const averages = weekdayTotals.map((w) =>
    w.occurrences > 0 ? w.sum / w.occurrences : 0,
  );

  let weakestDay = -1;
  let weakestAvg = Infinity;
  for (let day = 0; day < 7; day += 1) {
    if (weekdayTotals[day].withData < WEAK_DAY_MIN_WEEKS_WITH_DATA) continue;
    // Desempate: primeiro por ordem de dia (0=domingo) - o loop em ordem
    // crescente + "<" estrito ja garante isso naturalmente.
    if (averages[day] < weakestAvg) {
      weakestAvg = averages[day];
      weakestDay = day;
    }
  }
  if (weakestDay === -1) return null;

  const otherDaysSum = averages.reduce(
    (sum, avg, day) => (day === weakestDay ? sum : sum + avg),
    0,
  );
  const otherDaysAvg = otherDaysSum / 6;
  if (otherDaysAvg === 0) return null;

  const diff = Math.round(((otherDaysAvg - weakestAvg) / otherDaysAvg) * 100);
  if (diff < MIN_MEANINGFUL_DIFF_PERCENT) return null;

  return {
    type: 'weak_day',
    title: `${capitalize(WEEKDAY_NAMES[weakestDay])} mais fracas`,
    description: `Suas ${WEEKDAY_NAMES[weakestDay]} têm em média ${diff}% menos estudo que os outros dias.`,
    dataPoints: weekdayTotals[weakestDay].withData,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Materia negligenciada: entre as com meta semanal definida ha pelo menos 2
 * semanas, a com a menor razao (estudado/meta) nas ultimas 2 semanas - so reporta
 * se estiver abaixo de NEGLECTED_SUBJECT_RATIO_THRESHOLD da propria meta.
 */
export function computeNeglectedSubject(
  subjects: SubjectRecord[],
  dailyStats: DailyStatRecord[],
  now: Date,
): InsightItem | null {
  const eligibleSubjects = subjects.filter((s) => {
    const ageMs = now.getTime() - s.createdAt.getTime();
    return ageMs >= NEGLECTED_SUBJECT_MIN_SUBJECT_AGE_DAYS * 24 * 60 * 60 * 1000;
  });
  if (eligibleSubjects.length === 0) return null;

  const minutesBySubject = new Map<string, number>();
  const completedBySubject = new Map<string, number>();
  for (const stat of dailyStats) {
    for (const [subjectId, agg] of Object.entries(stat.bySubject)) {
      minutesBySubject.set(
        subjectId,
        (minutesBySubject.get(subjectId) ?? 0) + agg.seconds / 60,
      );
      completedBySubject.set(
        subjectId,
        (completedBySubject.get(subjectId) ?? 0) + agg.completed,
      );
    }
  }

  let worst: { subject: SubjectRecord; ratio: number } | null = null;
  for (const subject of eligibleSubjects) {
    const studiedMinutes = minutesBySubject.get(subject.id) ?? 0;
    const goalMinutes = subject.weeklyGoalMinutes * 2; // 2 semanas de meta
    if (goalMinutes <= 0) continue;
    const ratio = studiedMinutes / goalMinutes;
    if (!worst || ratio < worst.ratio) {
      worst = { subject, ratio };
    }
  }
  if (!worst || worst.ratio >= NEGLECTED_SUBJECT_RATIO_THRESHOLD) return null;

  const percentage = Math.round(worst.ratio * 100);
  return {
    type: 'neglected_subject',
    title: 'Matéria negligenciada',
    description: `${worst.subject.name} está a ${percentage}% da meta semanal nas últimas 2 semanas.`,
    dataPoints: completedBySubject.get(worst.subject.id) ?? 0,
  };
}

/**
 * Padrao de interrupcao: compara taxa de interrupcao por materia vs por bloco de
 * horario, usa a que tiver diferenca mais significativa contra a media geral - so
 * reporta se a diferenca (em pontos percentuais) for >= INTERRUPTION_MIN_POINTS_GAP
 * E houver pelo menos INTERRUPTION_MIN_TOTAL_INTERRUPTED sessoes interrompidas na
 * amostra toda.
 */
export function computeInterruptionPattern(
  sessions: SessionRecord[],
  timezone: string,
): InsightItem | null {
  const totalInterrupted = sessions.filter((s) => !s.completed).length;
  if (totalInterrupted < INTERRUPTION_MIN_TOTAL_INTERRUPTED) return null;
  if (sessions.length === 0) return null;

  const overallRate = totalInterrupted / sessions.length;

  type Candidate = { key: string; label: string; completed: number; interrupted: number };

  const bySubject = new Map<string, Candidate>();
  const byBlock = new Map<number, Candidate>();

  for (const session of sessions) {
    if (session.subjectId) {
      const entry = bySubject.get(session.subjectId) ?? {
        key: session.subjectId,
        label: session.subjectId,
        completed: 0,
        interrupted: 0,
      };
      if (session.completed) entry.completed += 1;
      else entry.interrupted += 1;
      bySubject.set(session.subjectId, entry);
    }

    const hour = localHour(session.startedAt, timezone);
    const blockIndex = Math.floor(hour / BLOCK_HOURS);
    const blockEntry = byBlock.get(blockIndex) ?? {
      key: String(blockIndex),
      label: BLOCK_LABELS[blockIndex],
      completed: 0,
      interrupted: 0,
    };
    if (session.completed) blockEntry.completed += 1;
    else blockEntry.interrupted += 1;
    byBlock.set(blockIndex, blockEntry);
  }

  function findWorst(
    candidates: Candidate[],
  ): { candidate: Candidate; rate: number } | null {
    let worst: { candidate: Candidate; rate: number } | null = null;
    for (const candidate of candidates) {
      const total = candidate.completed + candidate.interrupted;
      if (total < PEAK_HOURS_MIN_SESSIONS_IN_BLOCK) continue;
      const rate = candidate.interrupted / total;
      if (!worst || rate > worst.rate) worst = { candidate, rate };
    }
    return worst;
  }

  const worstSubject = findWorst([...bySubject.values()]);
  const worstBlock = findWorst([...byBlock.values()]);

  const subjectGapPoints = worstSubject
    ? (worstSubject.rate - overallRate) * 100
    : -Infinity;
  const blockGapPoints = worstBlock ? (worstBlock.rate - overallRate) * 100 : -Infinity;

  const useSubject = subjectGapPoints >= blockGapPoints;
  const winner = useSubject ? worstSubject : worstBlock;
  const gapPoints = useSubject ? subjectGapPoints : blockGapPoints;
  if (!winner || gapPoints < INTERRUPTION_MIN_POINTS_GAP) return null;

  const diff = pctRelative(winner.rate, overallRate);
  if (diff <= 0) return null;

  const contextLabel = useSubject
    ? `da matéria ${winner.candidate.label}`
    : `entre ${winner.candidate.label}`;

  return {
    type: 'interruption_pattern',
    title: 'Padrão de interrupção',
    description: `Suas sessões ${contextLabel} são interrompidas ${diff}% mais que a média.`,
    dataPoints: winner.candidate.completed + winner.candidate.interrupted,
  };
}

export interface InsightsResult {
  hasEnoughData: boolean;
  generatedAt: string | null;
  missingDays: number;
  missingSessions: number;
  insights: InsightItem[];
}

interface Eligibility {
  eligible: boolean;
  missingDays: number;
  missingSessions: number;
}

/**
 * Checagem barata (2 queries indexadas) de elegibilidade - separada do calculo
 * pesado dos insights em si. Reusada tanto pelo job (pra decidir se vale computar)
 * quanto pelo GET /insights (pra mostrar "faltam N dias/sessões" sempre atualizado,
 * mesmo entre execuções do job semanal - diferente do calculo dos insights, isso
 * e barato o suficiente pra rodar a cada request).
 */
async function getEligibility(userId: string): Promise<Eligibility> {
  const now = new Date();
  const [firstSession, completedCount] = await Promise.all([
    prisma.pomodoroSession.findFirst({
      where: { userId, type: 'FOCUS' },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    }),
    prisma.pomodoroSession.count({ where: { userId, type: 'FOCUS', completed: true } }),
  ]);

  const daysOfHistory = firstSession
    ? Math.floor(
        (now.getTime() - firstSession.startedAt.getTime()) / (24 * 60 * 60 * 1000),
      )
    : 0;
  const missingDays = Math.max(0, MIN_DAYS_OF_HISTORY - daysOfHistory);
  const missingSessions = Math.max(0, MIN_COMPLETED_SESSIONS - completedCount);

  return {
    eligible: missingDays === 0 && missingSessions === 0,
    missingDays,
    missingSessions,
  };
}

/**
 * Roda as 4 funcoes de calculo pra um usuario, buscando os dados brutos
 * necessarios. Chamado pelo job semanal (insights.worker.ts) - nunca on-demand a
 * cada request, e consulta pesada sobre historico.
 */
export async function computeInsightsForUser(
  userId: string,
  timezone: string,
): Promise<{
  eligible: boolean;
  missingDays: number;
  missingSessions: number;
  insights: InsightItem[];
  dataPointsUsed: number;
}> {
  const now = new Date();
  const eligibility = await getEligibility(userId);
  if (!eligibility.eligible) {
    return { ...eligibility, insights: [], dataPointsUsed: 0 };
  }

  const peakHoursSince = new Date(
    now.getTime() - PEAK_HOURS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const interruptionSince = new Date(
    now.getTime() - INTERRUPTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const earliestSince = new Date(
    Math.min(peakHoursSince.getTime(), interruptionSince.getTime()),
  );

  const [rawSessions, rawDailyStats, rawSubjects] = await Promise.all([
    prisma.pomodoroSession.findMany({
      where: { userId, type: 'FOCUS', startedAt: { gte: earliestSince } },
      select: { startedAt: true, completed: true, subjectId: true },
    }),
    prisma.dailyStudyStat.findMany({
      where: {
        userId,
        date: {
          gte: localDateSurrogate(
            new Date(now.getTime() - WEAK_DAY_LOOKBACK_WEEKS * 7 * 24 * 60 * 60 * 1000),
            timezone,
          ),
        },
      },
      select: { date: true, focusSeconds: true, bySubject: true },
    }),
    prisma.subject.findMany({
      where: { userId, archived: false, weeklyGoalMinutes: { not: null } },
      select: { id: true, name: true, weeklyGoalMinutes: true, createdAt: true },
    }),
  ]);

  const sessions: SessionRecord[] = rawSessions.map((s) => ({
    startedAt: s.startedAt,
    completed: s.completed,
    subjectId: s.subjectId,
  }));
  const dailyStats: DailyStatRecord[] = rawDailyStats.map((s) => ({
    date: s.date,
    focusSeconds: s.focusSeconds,
    bySubject:
      (s.bySubject as Record<string, { seconds: number; completed: number }>) ?? {},
  }));
  const subjects: SubjectRecord[] = rawSubjects.map((s) => ({
    id: s.id,
    name: s.name,
    weeklyGoalMinutes: s.weeklyGoalMinutes as number,
    createdAt: s.createdAt,
  }));

  const neglectedDailyStats = dailyStats.filter(
    (s) =>
      s.date.getTime() >=
      localDateSurrogate(
        new Date(now.getTime() - NEGLECTED_SUBJECT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        timezone,
      ).getTime(),
  );
  const peakHoursSessions = sessions.filter((s) => s.startedAt >= peakHoursSince);
  const interruptionSessions = sessions.filter((s) => s.startedAt >= interruptionSince);

  const insights = [
    computePeakHours(peakHoursSessions, timezone),
    computeWeakDay(dailyStats, now),
    computeNeglectedSubject(subjects, neglectedDailyStats, now),
    computeInterruptionPattern(interruptionSessions, timezone),
  ].filter((i): i is InsightItem => i !== null);

  return {
    eligible: true,
    missingDays: 0,
    missingSessions: 0,
    insights,
    dataPointsUsed: sessions.length,
  };
}

export async function getInsights(userId: string): Promise<InsightsResult> {
  const eligibility = await getEligibility(userId);
  if (!eligibility.eligible) {
    return {
      hasEnoughData: false,
      generatedAt: null,
      missingDays: eligibility.missingDays,
      missingSessions: eligibility.missingSessions,
      insights: [],
    };
  }

  const snapshot = await prisma.insightSnapshot.findUnique({ where: { userId } });
  if (!snapshot) {
    // Elegivel, mas o job semanal ainda nao rodou pra esse usuario (ficou
    // elegivel ha pouco - o job so roda uma vez por semana). Ja "tem dado
    // suficiente", so ainda sem insights calculados.
    return {
      hasEnoughData: true,
      generatedAt: null,
      missingDays: 0,
      missingSessions: 0,
      insights: [],
    };
  }

  return {
    hasEnoughData: true,
    generatedAt: snapshot.generatedAt.toISOString(),
    missingDays: 0,
    missingSessions: 0,
    insights: snapshot.insights as unknown as InsightItem[],
  };
}
