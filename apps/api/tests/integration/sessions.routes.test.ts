import request from 'supertest';

jest.mock('../../src/config/database', () => ({
  prisma: {
    pomodoroSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../../src/config/redis', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../src/modules/subjects/subjects.service', () => ({
  getSubject: jest.fn(),
}));

import { prisma } from '../../src/config/database';
import { app } from '../../src/app';
import { signAccessToken } from '../../src/shared/utils/jwt';

const mockedPrisma = prisma as unknown as {
  pomodoroSession: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    delete: jest.Mock;
  };
};

const authHeader = `Bearer ${signAccessToken({ sub: 'user-1', email: 'ada@example.com', plan: 'FREE' })}`;

describe('sessions routes', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/sessions');
    expect(response.status).toBe(401);
  });

  it('creates a free-standing focus session', async () => {
    mockedPrisma.pomodoroSession.create.mockResolvedValueOnce({
      id: 'session-1',
      userId: 'user-1',
      subjectId: null,
      type: 'FOCUS',
      durationSeconds: 1500,
      completed: true,
      startedAt: '2026-01-01T10:00:00.000Z',
      finishedAt: '2026-01-01T10:25:00.000Z',
    });

    const response = await request(app)
      .post('/api/sessions')
      .set('Authorization', authHeader)
      .send({
        type: 'FOCUS',
        durationSeconds: 1500,
        startedAt: '2026-01-01T10:00:00.000Z',
        finishedAt: '2026-01-01T10:25:00.000Z',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe('FOCUS');
  });

  it('rejects a session where finishedAt is before startedAt', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .set('Authorization', authHeader)
      .send({
        type: 'FOCUS',
        durationSeconds: 1500,
        startedAt: '2026-01-01T10:25:00.000Z',
        finishedAt: '2026-01-01T10:00:00.000Z',
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid session type', async () => {
    const response = await request(app)
      .post('/api/sessions')
      .set('Authorization', authHeader)
      .send({
        type: 'NAP',
        durationSeconds: 1500,
        startedAt: '2026-01-01T10:00:00.000Z',
        finishedAt: '2026-01-01T10:25:00.000Z',
      });

    expect(response.status).toBe(422);
  });

  it('returns 404 when fetching a session that does not belong to the user', async () => {
    mockedPrisma.pomodoroSession.findFirst.mockResolvedValueOnce(null);

    const response = await request(app)
      .get('/api/sessions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeader);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('lists sessions applying query filters', async () => {
    mockedPrisma.pomodoroSession.findMany.mockResolvedValueOnce([]);

    const response = await request(app)
      .get('/api/sessions?type=FOCUS&completed=true')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(mockedPrisma.pomodoroSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          type: 'FOCUS',
          completed: true,
        }),
      }),
    );
  });
});
