import bcrypt from 'bcrypt';

import { AppError } from '../../src/shared/errors/AppError';
import { ERROR_CODES } from '../../src/shared/errors/errorCodes';

jest.mock('../../src/config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import * as authService from '../../src/modules/auth/auth.service';

const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};
const mockedRedis = redis as unknown as { set: jest.Mock; get: jest.Mock; del: jest.Mock };
const mockedBcrypt = bcrypt as unknown as { hash: jest.Mock; compare: jest.Mock };

const baseUser = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  passwordHash: 'hashed-password',
  googleId: null,
  plan: 'FREE' as const,
};

describe('auth.service', () => {
  describe('register', () => {
    it('creates a new user with a hashed password and returns tokens', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockedBcrypt.hash.mockResolvedValueOnce('hashed-password');
      mockedPrisma.user.create.mockResolvedValueOnce(baseUser);
      mockedRedis.set.mockResolvedValueOnce('OK');

      const result = await authService.register({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'supersecret',
      });

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('supersecret', 10);
      expect(result.user).toEqual({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        plan: 'FREE',
      });
      expect(result.tokens.accessToken).toEqual(expect.any(String));
      expect(result.tokens.refreshToken).toEqual(expect.any(String));
    });

    it('throws CONFLICT when e-mail is already registered', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(baseUser);

      await expect(
        authService.register({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'supersecret',
        }),
      ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.CONFLICT });
    });
  });

  describe('login', () => {
    it('returns tokens when credentials are valid', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(baseUser);
      mockedBcrypt.compare.mockResolvedValueOnce(true);
      mockedRedis.set.mockResolvedValueOnce('OK');

      const result = await authService.login({
        email: 'ada@example.com',
        password: 'supersecret',
      });

      expect(result.tokens.accessToken).toEqual(expect.any(String));
    });

    it('throws INVALID_CREDENTIALS when user does not exist', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        authService.login({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.INVALID_CREDENTIALS });
    });

    it('throws INVALID_CREDENTIALS when password does not match', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(baseUser);
      mockedBcrypt.compare.mockResolvedValueOnce(false);

      await expect(
        authService.login({ email: 'ada@example.com', password: 'wrong-password' }),
      ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.INVALID_CREDENTIALS });
    });
  });

  describe('refresh', () => {
    it('throws INVALID_REFRESH_TOKEN for a malformed token', async () => {
      await expect(authService.refresh('not-a-valid-jwt')).rejects.toMatchObject<
        Partial<AppError>
      >({ code: ERROR_CODES.INVALID_REFRESH_TOKEN });
    });
  });
});
