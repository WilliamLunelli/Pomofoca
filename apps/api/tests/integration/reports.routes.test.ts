import request from 'supertest';

const dailyStudyStatMock = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  prisma: {
    dailyStudyStat: dailyStudyStatMock,
    subject: { findMany: jest.fn() },
  },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

import { app } from '../../src/app';
import { signAccessToken } from '../../src/shared/utils/jwt';

function authHeaderFor(plan: 'FREE' | 'PREMIUM') {
  return `Bearer ${signAccessToken({ sub: 'user-1', email: 'ada@example.com', plan })}`;
}

describe('reports routes - plan gating', () => {
  beforeEach(() => {
    dailyStudyStatMock.findMany.mockResolvedValue([]);
  });

  it('allows a free-plan user to query the default (week) summary', async () => {
    const response = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', authHeaderFor('FREE'));

    expect(response.status).toBe(200);
    expect(response.body.data.period).toBe('week');
  });

  it('blocks a free-plan user from requesting a month-long summary', async () => {
    const response = await request(app)
      .get('/api/reports/summary?period=month')
      .set('Authorization', authHeaderFor('FREE'));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('REPORT_HISTORY_LIMIT_REACHED');
  });

  it('blocks a free-plan user from requesting an explicit from date beyond 7 days', async () => {
    const response = await request(app)
      .get('/api/reports/breakdown?from=2020-01-01')
      .set('Authorization', authHeaderFor('FREE'));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('REPORT_HISTORY_LIMIT_REACHED');
  });

  it('allows a premium user to request a full-year summary', async () => {
    const response = await request(app)
      .get('/api/reports/summary?period=year')
      .set('Authorization', authHeaderFor('PREMIUM'));

    expect(response.status).toBe(200);
  });

  it('blocks a free-plan user from the heatmap entirely', async () => {
    const response = await request(app)
      .get('/api/reports/heatmap?year=2026')
      .set('Authorization', authHeaderFor('FREE'));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PREMIUM_FEATURE_REQUIRED');
  });

  it('allows a premium user to access the heatmap', async () => {
    const response = await request(app)
      .get('/api/reports/heatmap?year=2026')
      .set('Authorization', authHeaderFor('PREMIUM'));

    expect(response.status).toBe(200);
    expect(response.body.data.year).toBe(2026);
  });

  it('blocks a free-plan user from the compare endpoint', async () => {
    const response = await request(app)
      .get('/api/reports/compare?period=week')
      .set('Authorization', authHeaderFor('FREE'));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PREMIUM_FEATURE_REQUIRED');
  });

  it('lets streak run for a free-plan user without a hard block (self-scoped to last week)', async () => {
    const response = await request(app)
      .get('/api/reports/streak')
      .set('Authorization', authHeaderFor('FREE'));

    expect(response.status).toBe(200);
    expect(response.body.data.scope).toBe('week');
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/reports/summary');
    expect(response.status).toBe(401);
  });
});
