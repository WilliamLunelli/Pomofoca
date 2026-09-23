import crypto from 'node:crypto';

import { env } from '../../config/env';

const MP_API_BASE = 'https://api.mercadopago.com';

export type PreapprovalStatus = 'pending' | 'authorized' | 'paused' | 'cancelled';

export interface Preapproval {
  id: string;
  status: PreapprovalStatus;
  external_reference: string;
  init_point?: string;
}

async function mpFetch(path: string, init: RequestInit): Promise<Preapproval> {
  const response = await fetch(`${MP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Pago API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<Preapproval>;
}

/**
 * Cria uma assinatura recorrente (preapproval) no Mercado Pago e retorna o link de
 * checkout (init_point) para o usuario autorizar o pagamento (cartao ou PIX
 * recorrente, conforme configurado na conta Mercado Pago).
 */
export function createPreapproval(params: {
  userId: string;
  payerEmail: string;
}): Promise<Preapproval> {
  return mpFetch('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: 'Assinatura Pomofoca Premium',
      external_reference: params.userId,
      payer_email: params.payerEmail,
      back_url: env.MERCADO_PAGO_BACK_URL,
      status: 'pending',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: env.PREMIUM_PLAN_PRICE,
        currency_id: env.PREMIUM_PLAN_CURRENCY,
      },
    }),
  });
}

export function getPreapproval(id: string): Promise<Preapproval> {
  return mpFetch(`/preapproval/${id}`, { method: 'GET' });
}

export function cancelPreapproval(id: string): Promise<Preapproval> {
  return mpFetch(`/preapproval/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

/**
 * Valida a assinatura do webhook conforme documentado pelo Mercado Pago:
 * o header x-signature traz "ts=<timestamp>,v1=<hash>", e o hash e um HMAC-SHA256
 * sobre o manifest "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" usando o
 * webhook secret configurado na conta. Sem isso, qualquer requisicao externa
 * poderia forjar eventos de pagamento.
 */
export function verifyWebhookSignature(params: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
}): boolean {
  const { xSignature, xRequestId, dataId } = params;
  if (!xSignature || !dataId) return false;

  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    }),
  );
  const timestamp = parts.ts;
  const receivedHash = parts.v1;
  if (!timestamp || !receivedHash) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId ?? ''};ts:${timestamp};`;
  const expectedHash = crypto
    .createHmac('sha256', env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedHash);
  const receivedBuffer = Buffer.from(receivedHash);
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
