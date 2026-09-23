import { SESSION_TYPE, type Plan } from '@pomofoca/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/database';
import {
  addUTCDays,
  endOfUTCDate,
  resolveExplicitOrPeriodRange,
  resolvePeriodRange,
  startOfUTCDate,
  toDateString,
  type Period,
} from '../../shared/utils/period';

type Db = Prisma.TransactionClient;

interface SubjectAgg {
  seconds: number;
  completed: number;
}
type SubjectStatsMap = Record<string, SubjectAgg>;

const NO_SUBJECT_KEY = 'none';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface CompletedSessionInput {
  userId: string;
  subjectId: string | null;
  type: string;
  durationSeconds: number;
  completed: boolean;
  startedAt: Date;
}

async function adjustDailyStat(
  db: Db,
  session: CompletedSessionInput,
  sign: 1 | -1,
): Promise<void> {
  const date = startOfUTCDate(session.startedAt);
  const isFocus = session.type === SESSION_TYPE.FOCUS;
  const subjectKey = session.subjectId ?? NO_SUBJECT_KEY;

  const existing = await db.dailyStudyStat.findUnique({
    where: { userId_date: { userId: session.userId, date } },
  });

  const bySubject = { ...((existing?.bySubject as SubjectStatsMap | null) ?? {}) };
  if (isFocus) {
    const entry = bySubject[subjectKey] ?? { seconds: 0, completed: 0 };
    const nextEntry = {
      seconds: entry.seconds + sign * session.durationSeconds,
      completed: entry.completed + sign * (session.completed ? 1 : 0),
    };
    if (nextEntry.seconds <= 0 && nextEntry.completed <= 0) {
      delete bySubject[subjectKey];
    } else {
      bySubject[subjectKey] = nextEntry;
    }
  }

  const totalDelta = sign * session.durationSeconds;
  const focusDelta = isFocus ? sign * session.durationSeconds : 0;
  const completedDelta = isFocus && session.completed ? sign : 0;
  const interruptedDelta = isFocus && !session.completed ? sign : 0;

  if (!existing) {
    // Reversao (delete) de uma sessao cujo dia ja nao tem registro - nada a fazer.
    if (sign === -1) return;

    await db.dailyStudyStat.create({
      data: {
        userId: session.userId,
        date,
        totalSeconds: Math.max(0, totalDelta),
        focusSeconds: Math.max(0, focusDelta),
        sessionsCompleted: Math.max(0, completedDelta),
        sessionsInterrupted: Math.max(0, interruptedDelta),
        bySubject: bySubject as unknown as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await db.dailyStudyStat.update({
    where: { userId_date: { userId: session.userId, date } },
    data: {
      totalSeconds: Math.max(0, existing.totalSeconds + totalDelta),
      focusSeconds: Math.max(0, existing.focusSeconds + focusDelta),
      sessionsCompleted: Math.max(0, existing.sessionsCompleted + completedDelta),
      sessionsInterrupted: Math.max(0, existing.sessionsInterrupted + interruptedDelta),
      bySubject: bySubject as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Atualiza o agregado diario do usuario para a sessao recem-criada. Deve rodar na
 * mesma transacao da criacao da PomodoroSession (chamado a partir de
 * sessions.service.ts) para manter a tabela sempre consistente com o historico bruto.
 * So sessoes FOCUS contam para as metricas de estudo (focusSeconds, completed/
 * interrupted, bySubject) - pausas so somam em totalSeconds.
 */
export async function recordCompletedSession(
  db: Db,
  session: CompletedSessionInput,
): Promise<void> {
  await adjustDailyStat(db, session, 1);
}

/**
 * Desfaz o efeito de uma sessao no agregado diario. Deve rodar na mesma transacao da
 * exclusao da PomodoroSession (chamado a partir de sessions.service.ts) para que uma
 * sessao apagada nao continue contando nos relatorios.
 */
export async function reverseCompletedSession(
  db: Db,
  session: CompletedSessionInput,
): Promise<void> {
  await adjustDailyStat(db, session, -1);
}

export async function getSummary(userId: string, period: Period) {
  const { from, to } = resolvePeriodRange(period);
  const stats = await prisma.dailyStudyStat.findMany({
    where: { userId, date: { gte: from ?? undefined, lte: to } },
  });

  const studySeconds = stats.reduce((sum, stat) => sum + stat.focusSeconds, 0);
  const sessionsCompleted = stats.reduce((sum, stat) => sum + stat.sessionsCompleted, 0);
  const sessionsInterrupted = stats.reduce(
    (sum, stat) => sum + stat.sessionsInterrupted,
    0,
  );
  const totalSessions = sessionsCompleted + sessionsInterrupted;
  const activeDays = stats.filter((stat) => stat.focusSeconds > 0).length;

  return {
    period,
    from: from ? toDateString(from) : null,
    to: toDateString(to),
    studyMinutes: Math.round(studySeconds / 60),
    sessionsCompleted,
    sessionsInterrupted,
    completionRate:
      totalSessions > 0 ? Number((sessionsCompleted / totalSessions).toFixed(2)) : 0,
    activeDays,
  };
}

export async function getBreakdown(
  userId: string,
  period: Period | undefined,
  from: Date | undefined,
  to: Date | undefined,
) {
  const range = resolveExplicitOrPeriodRange(period, from, to);
  const stats = await prisma.dailyStudyStat.findMany({
    where: { userId, date: { gte: range.from ?? undefined, lte: range.to } },
  });

  const totals: SubjectStatsMap = {};
  for (const stat of stats) {
    const bySubject = (stat.bySubject as SubjectStatsMap | null) ?? {};
    for (const [subjectId, agg] of Object.entries(bySubject)) {
      const entry = totals[subjectId] ?? { seconds: 0, completed: 0 };
      totals[subjectId] = {
        seconds: entry.seconds + agg.seconds,
        completed: entry.completed + agg.completed,
      };
    }
  }

  const totalSeconds = Object.values(totals).reduce((sum, agg) => sum + agg.seconds, 0);
  const subjectIds = Object.keys(totals).filter((id) => id !== NO_SUBJECT_KEY);
  const subjects = subjectIds.length
    ? await prisma.subject.findMany({ where: { id: { in: subjectIds }, userId } })
    : [];
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));

  const breakdown = Object.entries(totals)
    .map(([subjectId, agg]) => {
      const subject =
        subjectId === NO_SUBJECT_KEY ? undefined : subjectById.get(subjectId);
      return {
        subjectId: subjectId === NO_SUBJECT_KEY ? null : subjectId,
        name: subject?.name ?? 'Sem matéria',
        color: subject?.color ?? null,
        minutes: Math.round(agg.seconds / 60),
        percentage:
          totalSeconds > 0 ? Number(((agg.seconds / totalSeconds) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return {
    from: range.from ? toDateString(range.from) : null,
    to: toDateString(range.to),
    totalMinutes: Math.round(totalSeconds / 60),
    subjects: breakdown,
  };
}

function computeHeatmapLevel(
  minutes: number,
  maxMinutesInDay: number,
): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || maxMinutesInDay <= 0) return 0;
  const ratio = minutes / maxMinutesInDay;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export async function getHeatmap(userId: string, year: number) {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const now = new Date();
  const rangeEnd = year === now.getUTCFullYear() ? endOfUTCDate(now) : yearEnd;

  const stats = await prisma.dailyStudyStat.findMany({
    where: { userId, date: { gte: yearStart, lte: rangeEnd } },
  });

  const statsByDate = new Map(
    stats.map((stat) => [
      toDateString(stat.date),
      {
        minutes: Math.round(stat.focusSeconds / 60),
        sessionsCompleted: stat.sessionsCompleted,
      },
    ]),
  );

  const maxMinutesInDay = Math.max(
    0,
    ...Array.from(statsByDate.values()).map((entry) => entry.minutes),
  );

  const days = [];
  for (let cursor = yearStart; cursor <= rangeEnd; cursor = addUTCDays(cursor, 1)) {
    const dateStr = toDateString(cursor);
    const entry = statsByDate.get(dateStr);
    const minutes = entry?.minutes ?? 0;
    days.push({
      date: dateStr,
      minutes,
      sessionsCompleted: entry?.sessionsCompleted ?? 0,
      level: computeHeatmapLevel(minutes, maxMinutesInDay),
    });
  }

  return { year, maxMinutesInDay, days };
}

export async function getTrend(
  userId: string,
  period: Period | undefined,
  from: Date | undefined,
  to: Date | undefined,
  granularity: 'day' | 'week' | 'month',
) {
  const range = resolveExplicitOrPeriodRange(period, from, to);
  const stats = await prisma.dailyStudyStat.findMany({
    where: { userId, date: { gte: range.from ?? undefined, lte: range.to } },
    orderBy: { date: 'asc' },
  });

  const bucketSizeDays = granularity === 'day' ? 1 : granularity === 'week' ? 7 : 30;
  const anchor = range.from ?? stats[0]?.date ?? range.to;

  const buckets = new Map<
    number,
    { from: Date; to: Date; seconds: number; sessionsCompleted: number }
  >();

  for (const stat of stats) {
    const daysSinceAnchor = Math.floor(
      (stat.date.getTime() - anchor.getTime()) / ONE_DAY_MS,
    );
    const bucketIndex = Math.floor(daysSinceAnchor / bucketSizeDays);
    const bucketFrom = addUTCDays(anchor, bucketIndex * bucketSizeDays);
    const bucketTo = addUTCDays(bucketFrom, bucketSizeDays - 1);
    const bucket = buckets.get(bucketIndex) ?? {
      from: bucketFrom,
      to: bucketTo,
      seconds: 0,
      sessionsCompleted: 0,
    };
    bucket.seconds += stat.focusSeconds;
    bucket.sessionsCompleted += stat.sessionsCompleted;
    buckets.set(bucketIndex, bucket);
  }

  const points = Array.from(buckets.values())
    .sort((a, b) => a.from.getTime() - b.from.getTime())
    .map((bucket) => ({
      from: toDateString(bucket.from),
      to: toDateString(bucket.to > range.to ? range.to : bucket.to),
      minutes: Math.round(bucket.seconds / 60),
      sessionsCompleted: bucket.sessionsCompleted,
    }));

  return {
    granularity,
    from: range.from ? toDateString(range.from) : null,
    to: toDateString(range.to),
    points,
  };
}

export async function getStreak(userId: string, plan: Plan) {
  const scope: 'week' | 'all' = plan === 'FREE' ? 'week' : 'all';
  const range =
    scope === 'week'
      ? resolvePeriodRange('week')
      : { from: null, to: endOfUTCDate(new Date()) };

  const activeStats = await prisma.dailyStudyStat.findMany({
    where: {
      userId,
      date: { gte: range.from ?? undefined, lte: range.to },
      focusSeconds: { gt: 0 },
    },
    orderBy: { date: 'asc' },
    select: { date: true },
  });

  const activeDates = activeStats.map((stat) => stat.date.getTime());

  let recordStreak = 0;
  let recordStreakEnd: number | null = null;
  let runLength = 0;

  for (let i = 0; i < activeDates.length; i += 1) {
    runLength =
      i > 0 && activeDates[i] - activeDates[i - 1] === ONE_DAY_MS ? runLength + 1 : 1;
    if (runLength > recordStreak) {
      recordStreak = runLength;
      recordStreakEnd = activeDates[i];
    }
  }

  const activeSet = new Set(activeDates);
  const today = startOfUTCDate(new Date()).getTime();
  let currentStreak = 0;
  let cursor = activeSet.has(today) ? today : today - ONE_DAY_MS;
  while (activeSet.has(cursor)) {
    currentStreak += 1;
    cursor -= ONE_DAY_MS;
  }

  return {
    scope,
    currentStreak,
    recordStreak,
    recordStreakDate: recordStreakEnd ? toDateString(new Date(recordStreakEnd)) : null,
  };
}

export async function getCompare(userId: string, period: Exclude<Period, 'all'>) {
  const current = resolvePeriodRange(period);
  const currentFrom = current.from as Date;
  const spanMs = current.to.getTime() - currentFrom.getTime();
  const previousTo = new Date(currentFrom.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - spanMs);

  const [currentStats, previousStats] = await Promise.all([
    prisma.dailyStudyStat.findMany({
      where: { userId, date: { gte: currentFrom, lte: current.to } },
    }),
    prisma.dailyStudyStat.findMany({
      where: { userId, date: { gte: previousFrom, lte: previousTo } },
    }),
  ]);

  const summarize = (stats: { focusSeconds: number; sessionsCompleted: number }[]) => ({
    studyMinutes: Math.round(
      stats.reduce((sum, stat) => sum + stat.focusSeconds, 0) / 60,
    ),
    sessionsCompleted: stats.reduce((sum, stat) => sum + stat.sessionsCompleted, 0),
  });

  const currentTotals = summarize(currentStats);
  const previousTotals = summarize(previousStats);

  const changePercentage =
    previousTotals.studyMinutes === 0
      ? currentTotals.studyMinutes === 0
        ? 0
        : 100
      : Number(
          (
            ((currentTotals.studyMinutes - previousTotals.studyMinutes) /
              previousTotals.studyMinutes) *
            100
          ).toFixed(1),
        );

  return {
    period,
    current: {
      from: toDateString(currentFrom),
      to: toDateString(current.to),
      ...currentTotals,
    },
    previous: {
      from: toDateString(previousFrom),
      to: toDateString(previousTo),
      ...previousTotals,
    },
    changePercentage,
  };
}
