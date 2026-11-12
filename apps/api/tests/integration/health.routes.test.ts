import request from 'supertest';

const prismaMock = {
  $queryRaw: jest.fn(),
};

const redisMock = {
  ping: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  prisma: prismaMock,
}));

jest.mock('../../src/config/redis', () => ({
  redis: redisMock,
}));

import { app } from '../../src/app';

describe('health routes (GET /api/health)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([1]);
    redisMock.ping.mockResolvedValue('PONG');
  });

  it('returns 200 with status ok when database and redis are healthy', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ok',
        checks: {
          database: 'ok',
          redis: 'ok',
        },
        uptimeSeconds: expect.any(Number),
      },
    });
    expect(Number.isInteger(response.body.data.uptimeSeconds)).toBe(true);
    expect(response.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('does not require authentication', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
  });

  it('returns 503 degraded when database check rejects', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('Connection lost'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'degraded',
        checks: {
          database: 'error',
          redis: 'ok',
        },
        uptimeSeconds: expect.any(Number),
      },
    });
  });

  it('returns 503 degraded when redis check rejects', async () => {
    redisMock.ping.mockRejectedValueOnce(new Error('Redis timeout'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'degraded',
        checks: {
          database: 'ok',
          redis: 'error',
        },
        uptimeSeconds: expect.any(Number),
      },
    });
  });

  it('does not leak sensitive error details when database check fails', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 10.0.0.5:5432 senha-secreta'),
    );

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    const rawBody = JSON.stringify(response.body);
    expect(rawBody).not.toContain('ECONNREFUSED');
    expect(rawBody).not.toContain('10.0.0.5');
    expect(rawBody).not.toContain('senha-secreta');
    expect(response.text).not.toContain('ECONNREFUSED');
    expect(response.text).not.toContain('10.0.0.5');
    expect(response.text).not.toContain('senha-secreta');

    expect(Object.keys(response.body.data).sort()).toEqual([
      'checks',
      'status',
      'uptimeSeconds',
    ]);
  });

  it('returns 503 degraded when a check times out', async () => {
    prismaMock.$queryRaw.mockReturnValue(new Promise(() => {}));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'degraded',
        checks: {
          database: 'error',
          redis: 'ok',
        },
        uptimeSeconds: expect.any(Number),
      },
    });
  }, 5000);
});
