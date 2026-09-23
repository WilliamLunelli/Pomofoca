import type { Response } from 'express';

import type { ErrorCode } from '../errors/errorCodes';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  statusCode = 400,
) {
  return res.status(statusCode).json({ success: false, error: { code, message } });
}
