import type { NextFunction, Request, Response } from 'express';

import { PLAN } from '@pomofoca/shared';
import { prisma } from '../config/database';
import { AppError } from '../shared/errors/AppError';
import { ERROR_CODES } from '../shared/errors/errorCodes';

const FREE_PLAN_SUBJECT_LIMIT = 3;

export async function enforceSubjectLimit(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
  }

  if (req.user.plan !== PLAN.FREE) {
    return next();
  }

  const activeSubjectsCount = await prisma.subject.count({
    where: { userId: req.user.id, archived: false },
  });

  if (activeSubjectsCount >= FREE_PLAN_SUBJECT_LIMIT) {
    throw new AppError(
      ERROR_CODES.SUBJECT_LIMIT_REACHED,
      `Free plan allows up to ${FREE_PLAN_SUBJECT_LIMIT} active subjects. Upgrade to Premium for unlimited subjects.`,
      403,
    );
  }

  next();
}
