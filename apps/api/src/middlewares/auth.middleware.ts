import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../shared/errors/AppError';
import { ERROR_CODES } from '../shared/errors/errorCodes';
import { verifyAccessToken } from '../shared/utils/jwt';

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Missing or invalid authorization header', 401);
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, plan: payload.plan };
    next();
  } catch {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid or expired access token', 401);
  }
}
