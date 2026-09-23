import request from 'supertest';

const userMock = { findUnique: jest.fn(), update: jest.fn() };

jest.mock('../../src/config/database', () => ({
  prisma: { user: userMock },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

import { app } from '../../src/app';
import { signAccessToken } from '../../src/shared/utils/jwt';

const authHeader = `Bearer ${signAccessToken({ sub: 'user-1', email: 'ada@example.com', plan: 'FREE' })}`;

describe('users routes', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await request(app).get('/api/users/me');
    expect(response.status).toBe(401);
  });

  it('returns the current user profile', async () => {
    userMock.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      plan: 'FREE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe('ada@example.com');
    expect(response.body.data.passwordHash).toBeUndefined();
  });

  it('updates the current user name', async () => {
    userMock.update.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Ada L.',
      email: 'ada@example.com',
      plan: 'FREE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader)
      .send({ name: 'Ada L.' });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('Ada L.');
  });

  it('rejects an empty name', async () => {
    const response = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader)
      .send({ name: 'A' });

    expect(response.status).toBe(422);
  });
});
