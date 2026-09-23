import { AppError } from '../../src/shared/errors/AppError';
import { ERROR_CODES } from '../../src/shared/errors/errorCodes';

const subscriptionMock = {
  findFirst: jest.fn(),
  upsert: jest.fn(),
  update: jest.fn(),
};
const userMock = { findUnique: jest.fn(), update: jest.fn() };

jest.mock('../../src/config/database', () => ({
  prisma: {
    subscription: subscriptionMock,
    user: userMock,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

jest.mock('../../src/modules/subscriptions/mercadoPago.client', () => ({
  createPreapproval: jest.fn(),
  cancelPreapproval: jest.fn(),
  getPreapproval: jest.fn(),
  verifyWebhookSignature: jest.fn(),
}));

import * as mercadoPago from '../../src/modules/subscriptions/mercadoPago.client';
import * as subscriptionsService from '../../src/modules/subscriptions/subscriptions.service';

const mockedMp = mercadoPago as unknown as {
  createPreapproval: jest.Mock;
  cancelPreapproval: jest.Mock;
  getPreapproval: jest.Mock;
  verifyWebhookSignature: jest.Mock;
};

describe('subscriptions.service - createCheckout', () => {
  it('creates a preapproval for a free-plan user', async () => {
    userMock.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'ada@example.com',
      plan: 'FREE',
    });
    mockedMp.createPreapproval.mockResolvedValueOnce({
      id: 'preapproval-1',
      status: 'pending',
      external_reference: 'user-1',
      init_point: 'https://mercadopago.com/checkout/preapproval-1',
    });

    const result = await subscriptionsService.createCheckout('user-1');

    expect(mockedMp.createPreapproval).toHaveBeenCalledWith({
      userId: 'user-1',
      payerEmail: 'ada@example.com',
    });
    expect(result).toEqual({
      checkoutUrl: 'https://mercadopago.com/checkout/preapproval-1',
      preapprovalId: 'preapproval-1',
    });
  });

  it('rejects checkout for a user who is already premium', async () => {
    userMock.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'ada@example.com',
      plan: 'PREMIUM',
    });

    await expect(subscriptionsService.createCheckout('user-1')).rejects.toMatchObject<
      Partial<AppError>
    >({ code: ERROR_CODES.CONFLICT });
    expect(mockedMp.createPreapproval).not.toHaveBeenCalled();
  });
});

describe('subscriptions.service - cancelSubscription', () => {
  it('cancels the active subscription and downgrades the user to FREE', async () => {
    subscriptionMock.findFirst.mockResolvedValueOnce({
      id: 'sub-1',
      userId: 'user-1',
      status: 'ACTIVE',
      mercadoPagoSubscriptionId: 'preapproval-1',
    });
    mockedMp.cancelPreapproval.mockResolvedValueOnce({
      id: 'preapproval-1',
      status: 'cancelled',
    });
    subscriptionMock.update.mockResolvedValueOnce({ id: 'sub-1', status: 'CANCELED' });
    userMock.update.mockResolvedValueOnce({ id: 'user-1', plan: 'FREE' });

    const result = await subscriptionsService.cancelSubscription('user-1');

    expect(mockedMp.cancelPreapproval).toHaveBeenCalledWith('preapproval-1');
    expect(userMock.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'FREE' },
    });
    expect(result).toEqual({ id: 'sub-1', status: 'CANCELED' });
  });

  it('throws NOT_FOUND when there is no active subscription', async () => {
    subscriptionMock.findFirst.mockResolvedValueOnce(null);

    await expect(subscriptionsService.cancelSubscription('user-1')).rejects.toMatchObject<
      Partial<AppError>
    >({ code: ERROR_CODES.NOT_FOUND });
    expect(mockedMp.cancelPreapproval).not.toHaveBeenCalled();
  });
});

describe('subscriptions.service - handleWebhook', () => {
  it('rejects a webhook with an invalid signature', async () => {
    mockedMp.verifyWebhookSignature.mockReturnValueOnce(false);

    await expect(
      subscriptionsService.handleWebhook(
        { type: 'preapproval', data: { id: 'preapproval-1' } },
        { xSignature: 'bad', xRequestId: 'req-1' },
      ),
    ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.UNAUTHORIZED });
    expect(mockedMp.getPreapproval).not.toHaveBeenCalled();
  });

  it('activates premium when the preapproval is authorized', async () => {
    mockedMp.verifyWebhookSignature.mockReturnValueOnce(true);
    mockedMp.getPreapproval.mockResolvedValueOnce({
      id: 'preapproval-1',
      status: 'authorized',
      external_reference: 'user-1',
    });

    await subscriptionsService.handleWebhook(
      { type: 'preapproval', data: { id: 'preapproval-1' } },
      { xSignature: 'good', xRequestId: 'req-1' },
    );

    expect(subscriptionMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mercadoPagoSubscriptionId: 'preapproval-1' },
        create: expect.objectContaining({
          userId: 'user-1',
          status: 'ACTIVE',
          plan: 'PREMIUM',
        }),
        update: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
    expect(userMock.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'PREMIUM' },
    });
  });

  it('downgrades the user when the preapproval is cancelled', async () => {
    mockedMp.verifyWebhookSignature.mockReturnValueOnce(true);
    mockedMp.getPreapproval.mockResolvedValueOnce({
      id: 'preapproval-1',
      status: 'cancelled',
      external_reference: 'user-1',
    });

    await subscriptionsService.handleWebhook(
      { type: 'preapproval', data: { id: 'preapproval-1' } },
      { xSignature: 'good', xRequestId: 'req-1' },
    );

    expect(userMock.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { plan: 'FREE' },
    });
  });

  it('ignores a pending preapproval without writing to the database', async () => {
    mockedMp.verifyWebhookSignature.mockReturnValueOnce(true);
    mockedMp.getPreapproval.mockResolvedValueOnce({
      id: 'preapproval-1',
      status: 'pending',
      external_reference: 'user-1',
    });

    await subscriptionsService.handleWebhook(
      { type: 'preapproval', data: { id: 'preapproval-1' } },
      { xSignature: 'good', xRequestId: 'req-1' },
    );

    expect(subscriptionMock.upsert).not.toHaveBeenCalled();
    expect(userMock.update).not.toHaveBeenCalled();
  });

  it('ignores non-preapproval event types', async () => {
    mockedMp.verifyWebhookSignature.mockReturnValueOnce(true);

    await subscriptionsService.handleWebhook(
      { type: 'payment', data: { id: 'payment-1' } },
      { xSignature: 'good', xRequestId: 'req-1' },
    );

    expect(mockedMp.getPreapproval).not.toHaveBeenCalled();
  });
});
