import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import type { Plan } from '@pomofoca/shared';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  plan: Plan;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const [, value, unit] = match;
  return Number(value) * DURATION_UNITS[unit];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN),
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
