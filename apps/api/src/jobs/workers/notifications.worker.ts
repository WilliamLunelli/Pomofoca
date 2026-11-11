import { Worker } from 'bullmq';

import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import * as notificationsService from '../../modules/notifications/notifications.service';
import {
  MIN_SECONDS_FOR_ACTIVE_DAY,
  getCompare,
  getStreak,
  getTodayStat,
} from '../../modules/reports/reports.service';
import { localDateSurrogate } from '../../shared/utils/period';
import { notificationsQueue } from '../queues/notifications.queue';

const MIN_SESSIONS_FOR_LEARNED_TIME = 5;
const LEARN_LOOKBACK_DAYS = 30;
const STREAK_RISK_LOCAL_HOUR = 20;
const WEEKLY_SUMMARY_LOCAL_HOUR = 20;
const WEEKLY_SUMMARY_LOCAL_WEEKDAY = 0; // domingo

/**
 * Hora local (0-23) de um instante num fuso IANA, via Intl (mesma tecnica usada em
 * shared/utils/period.ts::localDateSurrogate, so que pra hora em vez de dia).
 */
function localHour(instant: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(instant);
  // Intl pode devolver "24" pra meia-noite em alguns runtimes - normaliza.
  return Number(formatted) % 24;
}

/**
 * Moda (hora mais frequente) dos horarios de inicio de sessoes FOCUS dos ultimos
 * 30 dias, no fuso local do usuario. Exige uma amostra minima antes de arriscar um
 * palpite - poucos dados dao um "horario aprendido" que nao significa nada.
 */
async function computeLearnedReminderTime(
  userId: string,
  timezone: string,
): Promise<string | null> {
  const since = new Date(Date.now() - LEARN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const sessions = await prisma.pomodoroSession.findMany({
    where: { userId, type: 'FOCUS', startedAt: { gte: since } },
    select: { startedAt: true },
  });
  if (sessions.length < MIN_SESSIONS_FOR_LEARNED_TIME) return null;

  const hourCounts = new Map<number, number>();
  for (const session of sessions) {
    const hour = localHour(session.startedAt, timezone);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  let bestHour = 0;
  let bestCount = -1;
  for (const [hour, count] of hourCounts) {
    if (count > bestCount) {
      bestHour = hour;
      bestCount = count;
    }
  }
  return `${String(bestHour).padStart(2, '0')}:00`;
}

async function runLearnReminderTimes(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { plan: 'PREMIUM', pushSubscriptions: { some: {} } },
    select: { id: true, timezone: true },
  });

  for (const user of users) {
    const learnedReminderTime = await computeLearnedReminderTime(user.id, user.timezone);
    if (learnedReminderTime === null) continue;
    // getPreferences garante que a linha existe (upsert com defaults) antes do
    // update direto - learnedReminderTime e so calculado pelo job, nunca exposto
    // no PATCH de preferencias do usuario, entao nao passa por updatePreferences.
    await notificationsService.getPreferences(user.id);
    await prisma.notificationPreference.update({
      where: { userId: user.id },
      data: { learnedReminderTime },
    });
  }

  logger.info({ userCount: users.length }, 'Learned reminder times recomputed');
}

/**
 * Roda a cada hora, em UTC - pra cada usuario Premium com push ativo, checa (no
 * fuso LOCAL dele) se e a hora de disparar cada um dos 3 tipos de notificacao.
 * Uma unica varredura por hora em vez de 3 jobs separados evita 3x as queries de
 * usuario pra checar a mesma coisa (que horas sao pro fuso dele agora).
 */
async function runHourlySweep(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { plan: 'PREMIUM', pushSubscriptions: { some: {} } },
    select: { id: true, timezone: true },
  });

  const now = new Date();
  let sent = 0;

  for (const user of users) {
    const preferences = await notificationsService.getPreferences(user.id);
    const hour = localHour(now, user.timezone);
    const localDay = localDateSurrogate(now, user.timezone);
    const weekday = localDay.getUTCDay();

    const todayStat = await getTodayStat(user.id, user.timezone);
    const hasCompletedToday = (todayStat?.sessionsCompleted ?? 0) > 0;
    const isTodayActive = (todayStat?.totalSeconds ?? 0) >= MIN_SECONDS_FOR_ACTIVE_DAY;

    // 1. Lembrete diario, no horario aprendido - so se ainda nao completou nada hoje.
    if (
      preferences.dailyReminderEnabled &&
      preferences.learnedReminderTime === `${String(hour).padStart(2, '0')}:00` &&
      !hasCompletedToday
    ) {
      await notificationsService.sendPushToUser(user.id, {
        title: 'Hora de estudar',
        body: 'Você ainda não estudou hoje. Bora começar um pomodoro?',
        url: '/timer',
      });
      sent += 1;
    }

    // 2. Streak em risco, as 20h locais - so se tem streak ativa e hoje ainda nao
    // virou dia ativo (senao a streak nem esta em risco).
    if (
      preferences.streakRiskEnabled &&
      hour === STREAK_RISK_LOCAL_HOUR &&
      !isTodayActive
    ) {
      const streak = await getStreak(user.id, 'PREMIUM', user.timezone);
      if (streak.currentStreak > 0) {
        await notificationsService.sendPushToUser(user.id, {
          title: 'Sua sequência está em risco!',
          body: `Você tem uma sequência de ${streak.currentStreak} dias — não deixe ela quebrar hoje.`,
          url: '/timer',
        });
        sent += 1;
      }
    }

    // 3. Resumo semanal, domingo a noite (fuso local).
    if (
      preferences.weeklySummaryEnabled &&
      hour === WEEKLY_SUMMARY_LOCAL_HOUR &&
      weekday === WEEKLY_SUMMARY_LOCAL_WEEKDAY
    ) {
      const compare = await getCompare(user.id, 'week', user.timezone);
      const hours = Math.round((compare.current.studyMinutes / 60) * 10) / 10;
      const changeText =
        compare.changePercentage === 0
          ? 'igual à semana passada'
          : compare.changePercentage > 0
            ? `${compare.changePercentage}% a mais que a semana passada`
            : `${Math.abs(compare.changePercentage)}% a menos que a semana passada`;
      await notificationsService.sendPushToUser(user.id, {
        title: 'Seu resumo da semana',
        body: `Você estudou ${hours}h essa semana — ${changeText}.`,
        url: '/reports',
      });
      sent += 1;
    }
  }

  logger.info({ userCount: users.length, sent }, 'Hourly notification sweep completed');
}

export function initNotificationsWorker(): Worker {
  const worker = new Worker(
    'notifications',
    async (job) => {
      if (job.name === 'hourly-sweep') return runHourlySweep();
      if (job.name === 'learn-reminder-times') return runLearnReminderTimes();
      logger.info(
        { jobId: job.id, name: job.name },
        'Unknown notification job, skipping',
      );
    },
    { connection: redis },
  );

  worker.on('failed', (job, err) =>
    logger.error({ err, jobId: job?.id, name: job?.name }, 'Notification job failed'),
  );

  // Repeatable jobs - registrar de novo no boot e barato/idempotente no BullMQ
  // (mesma chave de repeat nao duplica), entao nao precisa de guarda extra aqui.
  void notificationsQueue.add(
    'hourly-sweep',
    {},
    { repeat: { pattern: '0 * * * *' }, jobId: 'hourly-sweep' },
  );
  void notificationsQueue.add(
    'learn-reminder-times',
    {},
    { repeat: { pattern: '0 3 * * 1' }, jobId: 'learn-reminder-times' },
  );

  return worker;
}
