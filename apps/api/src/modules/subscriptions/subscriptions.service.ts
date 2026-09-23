import { PLAN } from '@pomofoca/shared';

import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError } from '../../shared/errors/AppError';
import { ERROR_CODES } from '../../shared/errors/errorCodes';
import * as mercadoPago from './mercadoPago.client';
import type { PreapprovalStatus } from './mercadoPago.client';
import type { MercadoPagoWebhookInput } from './subscriptions.schema';

export async function getCurrentSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId },
    orderBy: { startDate: 'desc' },
  });
}

export async function createCheckout(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
  }
  if (user.plan === PLAN.PREMIUM) {
    throw new AppError(
      ERROR_CODES.CONFLICT,
      'User already has an active Premium plan',
      409,
    );
  }

  const preapproval = await mercadoPago.createPreapproval({
    userId,
    payerEmail: user.email,
  });

  return {
    checkoutUrl: preapproval.init_point ?? null,
    preapprovalId: preapproval.id,
  };
}

export async function cancelSubscription(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
  });

  if (!subscription?.mercadoPagoSubscriptionId) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'No active subscription found', 404);
  }

  await mercadoPago.cancelPreapproval(subscription.mercadoPagoSubscriptionId);

  const [updated] = await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELED', endDate: new Date() },
    }),
    prisma.user.update({ where: { id: userId }, data: { plan: PLAN.FREE } }),
  ]);

  return updated;
}

function mapPreapprovalStatus(status: PreapprovalStatus) {
  switch (status) {
    case 'authorized':
      return { subscriptionStatus: 'ACTIVE' as const, userPlan: PLAN.PREMIUM };
    case 'paused':
      return { subscriptionStatus: 'PAST_DUE' as const, userPlan: PLAN.FREE };
    case 'cancelled':
      return { subscriptionStatus: 'CANCELED' as const, userPlan: PLAN.FREE };
    case 'pending':
    default:
      return null;
  }
}

export interface WebhookSignatureHeaders {
  xSignature: string | undefined;
  xRequestId: string | undefined;
}

export async function handleWebhook(
  payload: MercadoPagoWebhookInput,
  headers: WebhookSignatureHeaders,
): Promise<void> {
  const dataId = payload.data?.id;

  const isValid = mercadoPago.verifyWebhookSignature({
    xSignature: headers.xSignature,
    xRequestId: headers.xRequestId,
    dataId,
  });
  if (!isValid) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid webhook signature', 401);
  }

  if (payload.type !== 'preapproval' || !dataId) {
    // Outros tipos de evento (ex: payment) nao sao usados para atualizar o plano -
    // o preapproval e a fonte da verdade sobre o estado da assinatura recorrente.
    return;
  }

  const preapproval = await mercadoPago.getPreapproval(dataId);
  const mapped = mapPreapprovalStatus(preapproval.status);
  if (!mapped) {
    logger.info(
      { preapprovalId: preapproval.id, status: preapproval.status },
      'Ignoring pending preapproval webhook',
    );
    return;
  }

  const userId = preapproval.external_reference;

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { mercadoPagoSubscriptionId: preapproval.id },
      create: {
        userId,
        status: mapped.subscriptionStatus,
        plan: PLAN.PREMIUM,
        mercadoPagoSubscriptionId: preapproval.id,
        startDate: new Date(),
        endDate: mapped.subscriptionStatus === 'CANCELED' ? new Date() : null,
      },
      update: {
        status: mapped.subscriptionStatus,
        endDate: mapped.subscriptionStatus === 'CANCELED' ? new Date() : null,
      },
    }),
    prisma.user.update({ where: { id: userId }, data: { plan: mapped.userPlan } }),
  ]);
}
