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
import { resetHealthCacheForTests } from '../../src/modules/health/health.service';

describe('health routes (GET /api/health)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetHealthCacheForTests();
    process.env = {
      ...originalEnv,
      HEALTH_CACHE_MS: '0',
      HEALTH_CHECK_TIMEOUT_MS: '50',
    };
    prismaMock.$queryRaw.mockReset().mockResolvedValue([1]);
    redisMock.ping.mockReset().mockResolvedValue('PONG');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 200 with status ok and checks when database and redis are healthy (without uptimeSeconds)', async () => {
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
      },
    });
    expect(response.body.data).not.toHaveProperty('uptimeSeconds');
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
      },
    });
    expect(response.body.data).not.toHaveProperty('uptimeSeconds');
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
      },
    });
    expect(response.body.data).not.toHaveProperty('uptimeSeconds');
  });

  it('returns 503 degraded when both database and redis checks reject', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('Connection lost'));
    redisMock.ping.mockRejectedValueOnce(new Error('Redis timeout'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'degraded',
        checks: {
          database: 'error',
          redis: 'error',
        },
      },
    });
    expect(response.body.data).not.toHaveProperty('uptimeSeconds');
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

    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'degraded',
        checks: {
          database: 'error',
          redis: 'ok',
        },
      },
    });
  });

  it('returns 503 degraded when a check times out after 50ms', async () => {
    prismaMock.$queryRaw.mockImplementationOnce(() => new Promise(() => {}));

    const start = Date.now();
    const response = await request(app).get('/api/health');
    const elapsed = Date.now() - start;

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'degraded',
        checks: {
          database: 'error',
          redis: 'ok',
        },
      },
    });
    expect(elapsed).toBeLessThan(1000);
  });

  it('reuses cached health status when HEALTH_CACHE_MS is set', async () => {
    process.env.HEALTH_CACHE_MS = '60000';

    const res1 = await request(app).get('/api/health');
    const res2 = await request(app).get('/api/health');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redisMock.ping).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests sharing the same in-flight execution', async () => {
    process.env.HEALTH_CACHE_MS = '0';
    prismaMock.$queryRaw.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve([1]), 30)),
    );

    const [res1, res2] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/health'),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body).toEqual(res2.body);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redisMock.ping).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for legacy /health endpoint outside /api', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(404);
  });

  it('returns only status without checks in production environment', async () => {
    const actualEnv = jest.requireActual('../../src/config/env');
    let isolatedApp: typeof app;
    jest.isolateModules(() => {
      jest.doMock('../../src/config/env', () => ({
        ...actualEnv,
        env: {
          ...actualEnv.env,
          NODE_ENV: 'production',
        },
      }));
      isolatedApp = require('../../src/app').app;
    });

    const response = await request(isolatedApp!).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ok',
      },
    });
    expect(response.body.data).not.toHaveProperty('checks');
  });
});
