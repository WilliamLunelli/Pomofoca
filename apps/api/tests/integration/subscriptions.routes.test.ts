import crypto from 'node:crypto';

import request from 'supertest';

const subscriptionMock = { findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn() };
const userMock = { findUnique: jest.fn(), update: jest.fn() };

jest.mock('../../src/config/database', () => ({
  prisma: {
    subscription: subscriptionMock,
    user: userMock,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

jest.mock('../../src/modules/subscriptions/mercadoPago.client', () => {
  const actual = jest.requireActual('../../src/modules/subscriptions/mercadoPago.client');
  return {
    ...actual,
    createPreapproval: jest.fn(),
    cancelPreapproval: jest.fn(),
    getPreapproval: jest.fn(),
  };
});

import { app } from '../../src/app';
import * as mercadoPago from '../../src/modules/subscriptions/mercadoPago.client';
import { signAccessToken } from '../../src/shared/utils/jwt';

const mockedMp = mercadoPago as unknown as { getPreapproval: jest.Mock };

const WEBHOOK_SECRET = 'test-mp-webhook-secret';

function signWebhook(dataId: string, requestId: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

describe('POST /api/subscriptions/webhooks/mercado-pago', () => {
  it('processes a validly signed preapproval webhook', async () => {
    mockedMp.getPreapproval.mockResolvedValueOnce({
      id: 'preapproval-1',
      status: 'authorized',
      external_reference: 'user-1',
    });

    const response = await request(app)
      .post('/api/subscriptions/webhooks/mercado-pago')
      .set('x-signature', signWebhook('preapproval-1', 'req-1'))
      .set('x-request-id', 'req-1')
      .send({ type: 'preapproval', data: { id: 'preapproval-1' } });

    expect(response.status).toBe(200);
    expect(userMock.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'PREMIUM' },
    });
  });

  it('rejects a webhook with a forged signature', async () => {
    const response = await request(app)
      .post('/api/subscriptions/webhooks/mercado-pago')
      .set('x-signature', 'ts=1,v1=forged')
      .set('x-request-id', 'req-1')
      .send({ type: 'preapproval', data: { id: 'preapproval-1' } });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('subscriptions routes - authenticated endpoints', () => {
  it('rejects unauthenticated access', async () => {
    const response = await request(app).get('/api/subscriptions');
    expect(response.status).toBe(401);
  });

  it('returns the current subscription for an authenticated user', async () => {
    subscriptionMock.findFirst.mockResolvedValueOnce({ id: 'sub-1', status: 'ACTIVE' });

    const token = signAccessToken({
      sub: 'user-1',
      email: 'ada@example.com',
      plan: 'PREMIUM',
    });
    const response = await request(app)
      .get('/api/subscriptions')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ACTIVE');
  });
});
