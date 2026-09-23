import request from 'supertest';

jest.mock('../../src/config/database', () => ({
  prisma: {
    subject: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
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

import { prisma } from '../../src/config/database';
import { app } from '../../src/app';
import { signAccessToken } from '../../src/shared/utils/jwt';

const mockedPrisma = prisma as unknown as {
  subject: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
};

function authHeaderFor(plan: 'FREE' | 'PREMIUM') {
  const token = signAccessToken({ sub: 'user-1', email: 'ada@example.com', plan });
  return `Bearer ${token}`;
}

describe('subjects routes', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/subjects');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('creates a subject for a free-plan user under the limit', async () => {
    mockedPrisma.subject.count.mockResolvedValueOnce(2);
    mockedPrisma.subject.create.mockResolvedValueOnce({
      id: 'subject-1',
      userId: 'user-1',
      name: 'Matemática',
      color: '#FF5733',
      archived: false,
    });

    const response = await request(app)
      .post('/api/subjects')
      .set('Authorization', authHeaderFor('FREE'))
      .send({ name: 'Matemática', color: '#FF5733' });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('Matemática');
  });

  it('blocks creating a 4th active subject on the free plan', async () => {
    mockedPrisma.subject.count.mockResolvedValueOnce(3);

    const response = await request(app)
      .post('/api/subjects')
      .set('Authorization', authHeaderFor('FREE'))
      .send({ name: 'Física', color: '#3366FF' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'SUBJECT_LIMIT_REACHED' },
    });
    expect(mockedPrisma.subject.create).not.toHaveBeenCalled();
  });

  it('allows a premium user past the free-plan limit', async () => {
    mockedPrisma.subject.create.mockResolvedValueOnce({
      id: 'subject-4',
      userId: 'user-1',
      name: 'Química',
      color: '#00CC66',
      archived: false,
    });

    const response = await request(app)
      .post('/api/subjects')
      .set('Authorization', authHeaderFor('PREMIUM'))
      .send({ name: 'Química', color: '#00CC66' });

    expect(response.status).toBe(201);
    expect(mockedPrisma.subject.count).not.toHaveBeenCalled();
  });

  it('rejects an invalid color on create', async () => {
    const response = await request(app)
      .post('/api/subjects')
      .set('Authorization', authHeaderFor('FREE'))
      .send({ name: 'Matemática', color: 'not-a-hex-color' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when fetching a subject that does not belong to the user', async () => {
    mockedPrisma.subject.findFirst.mockResolvedValueOnce(null);

    const response = await request(app)
      .get('/api/subjects/00000000-0000-0000-0000-000000000000')
      .set('Authorization', authHeaderFor('FREE'));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
