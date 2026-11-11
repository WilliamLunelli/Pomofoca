import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { webpush } from '../../config/webPush';
import type { SubscribeInput, UpdatePreferencesInput } from './notifications.schema';

const DEFAULT_PREFERENCES = {
  dailyReminderEnabled: true,
  streakRiskEnabled: true,
  weeklySummaryEnabled: true,
};

export async function saveSubscription(userId: string, input: SubscribeInput) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId, endpoint: input.endpoint, keys: input.keys },
    // Mesmo endpoint pode reaparecer se o usuario deslogou/logou de novo no mesmo
    // navegador - garante que ele volta a apontar pro userId certo.
    update: { userId, keys: input.keys },
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function getPreferences(userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_PREFERENCES },
    update: {},
  });
}

export async function updatePreferences(userId: string, input: UpdatePreferencesInput) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_PREFERENCES, ...input },
    update: input,
  });
}

/**
 * Envia um push pra todos os dispositivos inscritos do usuario. Assinaturas que o
 * push service reporta como mortas (404/410 - usuario desinstalou o PWA, limpou o
 * navegador, etc.) sao removidas na hora, sem esperar um job de limpeza separado.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
        JSON.stringify(payload),
      ),
    ),
  );

  await Promise.all(
    results.map(async (result, i) => {
      if (result.status !== 'rejected') return;
      const statusCode = (result.reason as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscriptions[i].id } });
        return;
      }
      logger.error({ err: result.reason }, 'Failed to send push notification');
    }),
  );

  return { sent: subscriptions.length };
}
