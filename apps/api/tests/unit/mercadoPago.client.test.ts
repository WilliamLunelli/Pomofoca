import crypto from 'node:crypto';

// Definido em tests/jest.setup.ts (setupFiles), ja carregado antes deste arquivo.
const WEBHOOK_SECRET = 'test-mp-webhook-secret';

import { verifyWebhookSignature } from '../../src/modules/subscriptions/mercadoPago.client';

function buildSignature(dataId: string, requestId: string, ts: string, secret: string) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

describe('mercadoPago.client - verifyWebhookSignature', () => {
  it('accepts a signature computed with the correct secret', () => {
    const xSignature = buildSignature('abc123', 'req-1', '1700000000', WEBHOOK_SECRET);

    const result = verifyWebhookSignature({
      xSignature,
      xRequestId: 'req-1',
      dataId: 'abc123',
    });

    expect(result).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const xSignature = buildSignature('abc123', 'req-1', '1700000000', 'wrong-secret');

    const result = verifyWebhookSignature({
      xSignature,
      xRequestId: 'req-1',
      dataId: 'abc123',
    });

    expect(result).toBe(false);
  });

  it('rejects when the dataId does not match what was signed', () => {
    const xSignature = buildSignature('abc123', 'req-1', '1700000000', WEBHOOK_SECRET);

    const result = verifyWebhookSignature({
      xSignature,
      xRequestId: 'req-1',
      dataId: 'different-id',
    });

    expect(result).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const result = verifyWebhookSignature({
      xSignature: undefined,
      xRequestId: 'req-1',
      dataId: 'abc123',
    });

    expect(result).toBe(false);
  });

  it('rejects a malformed signature header', () => {
    const result = verifyWebhookSignature({
      xSignature: 'not-a-valid-header',
      xRequestId: 'req-1',
      dataId: 'abc123',
    });

    expect(result).toBe(false);
  });
});
