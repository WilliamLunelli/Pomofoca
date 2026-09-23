import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { AppError } from '../../shared/errors/AppError';
import { ERROR_CODES } from '../../shared/errors/errorCodes';
import {
  parseDurationToSeconds,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../shared/utils/jwt';
import type { AuthResult, AuthTokens, AuthenticatedUser } from './auth.types';
import type { GoogleAuthInput, LoginInput, RegisterInput } from './auth.schema';

const BCRYPT_SALT_ROUNDS = 10;
const REFRESH_KEY_PREFIX = 'refresh_token';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function toAuthenticatedUser(user: {
  id: string;
  name: string;
  email: string;
  plan: AuthenticatedUser['plan'];
}): AuthenticatedUser {
  return { id: user.id, name: user.name, email: user.email, plan: user.plan };
}

function refreshTokenKey(userId: string, jti: string) {
  return `${REFRESH_KEY_PREFIX}:${userId}:${jti}`;
}

async function issueTokens(user: AuthenticatedUser): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, plan: user.plan });

  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  const ttlSeconds = parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN);
  await redis.set(refreshTokenKey(user.id, jti), '1', 'EX', ttlSeconds);

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(ERROR_CODES.CONFLICT, 'E-mail already in use', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash },
  });

  const authenticatedUser = toAuthenticatedUser(user);
  const tokens = await issueTokens(authenticatedUser);
  return { user: authenticatedUser, tokens };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user?.passwordHash) {
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid e-mail or password', 401);
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid e-mail or password', 401);
  }

  const authenticatedUser = toAuthenticatedUser(user);
  const tokens = await issueTokens(authenticatedUser);
  return { user: authenticatedUser, tokens };
}

export async function loginWithGoogle(input: GoogleAuthInput): Promise<AuthResult> {
  const ticket = await googleClient.verifyIdToken({
    idToken: input.idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email || !payload.sub) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid Google token', 401);
  }

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: payload.name ?? payload.email,
        email: payload.email,
        googleId: payload.sub,
      },
    });
  } else if (!user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId: payload.sub },
    });
  }

  const authenticatedUser = toAuthenticatedUser(user);
  const tokens = await issueTokens(authenticatedUser);
  return { user: authenticatedUser, tokens };
}

export async function refresh(refreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(ERROR_CODES.INVALID_REFRESH_TOKEN, 'Invalid or expired refresh token', 401);
  }

  const key = refreshTokenKey(payload.sub, payload.jti);
  const exists = await redis.get(key);
  if (!exists) {
    throw new AppError(ERROR_CODES.INVALID_REFRESH_TOKEN, 'Refresh token has been revoked', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new AppError(ERROR_CODES.INVALID_REFRESH_TOKEN, 'User not found', 401);
  }

  await redis.del(key);

  return issueTokens(toAuthenticatedUser(user));
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await redis.del(refreshTokenKey(payload.sub, payload.jti));
  } catch {
    // Token já inválido/expirado — logout é idempotente, não precisa falhar.
  }
}
