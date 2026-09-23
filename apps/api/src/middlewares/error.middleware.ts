import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { logger } from '../config/logger';
import { AppError } from '../shared/errors/AppError';
import { ERROR_CODES } from '../shared/errors/errorCodes';
import { sendError } from '../shared/utils/apiResponse';

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof AppError) {
    return sendError(res, error.code, error.message, error.statusCode);
  }

  if (error instanceof ZodError) {
    return sendError(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      error.issues.map((issue) => issue.message).join('; '),
      422,
    );
  }

  // pino so serializa Error automaticamente na chave "err" (seu serializer padrao
  // procura esse nome exato) - usar "error" faz o log sair como "{}", escondendo a
  // mensagem/stack real e dificultando debugar qualquer falha inesperada.
  logger.error({ err: error }, 'Unhandled error');
  return sendError(res, ERROR_CODES.INTERNAL_ERROR, 'Internal server error', 500);
}
