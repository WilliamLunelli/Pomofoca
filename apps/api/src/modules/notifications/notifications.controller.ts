import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as notificationsService from './notifications.service';
import type {
  SubscribeInput,
  UnsubscribeInput,
  UpdatePreferencesInput,
} from './notifications.schema';

export async function subscribeHandler(req: Request, res: Response) {
  await notificationsService.saveSubscription(req.user!.id, req.body as SubscribeInput);
  return sendSuccess(res, null, 201);
}

export async function unsubscribeHandler(req: Request, res: Response) {
  const { endpoint } = req.body as UnsubscribeInput;
  await notificationsService.removeSubscription(req.user!.id, endpoint);
  return sendSuccess(res, null, 200);
}

export async function getPreferencesHandler(req: Request, res: Response) {
  const preferences = await notificationsService.getPreferences(req.user!.id);
  return sendSuccess(res, preferences);
}

export async function updatePreferencesHandler(req: Request, res: Response) {
  const preferences = await notificationsService.updatePreferences(
    req.user!.id,
    req.body as UpdatePreferencesInput,
  );
  return sendSuccess(res, preferences);
}

// Envio manual sob demanda - existe pra validar o fluxo de subscribe/push de ponta
// a ponta antes dos jobs agendados (lembrete diario, streak em risco, resumo
// semanal) existirem. Nao le NotificationPreference - e um teste, nao um dos tipos
// reais de notificacao.
export async function testHandler(req: Request, res: Response) {
  const result = await notificationsService.sendPushToUser(req.user!.id, {
    title: 'Pomofoca',
    body: 'Notificação de teste - se você está vendo isso, está tudo funcionando.',
  });
  return sendSuccess(res, result);
}
