import type { NextFunction, Request, Response } from 'express';

import { PLAN } from '@pomofoca/shared';
import { prisma } from '../config/database';
import { AppError } from '../shared/errors/AppError';
import { ERROR_CODES } from '../shared/errors/errorCodes';
import { resolveExplicitOrPeriodRange, type Period } from '../shared/utils/period';

const FREE_PLAN_SUBJECT_LIMIT = 3;
const FREE_PLAN_REPORT_HISTORY_DAYS = 7;

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

/**
 * Bloqueia (403) requisicoes de relatorio cujo periodo/intervalo solicitado
 * ultrapasse os ultimos N dias permitidos no plano gratuito. Le `period`/`from`/`to`
 * ja validados e coagidos pelo validate.middleware, entao deve rodar depois dele.
 */
export function enforceReportHistoryLimit(
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

  const query = req.query as { period?: Period; from?: Date; to?: Date };
  const { from } = resolveExplicitOrPeriodRange(query.period, query.from, query.to);
  const earliestAllowed = resolveExplicitOrPeriodRange('week', undefined, undefined).from;

  if (from === null || (earliestAllowed && from < earliestAllowed)) {
    throw new AppError(
      ERROR_CODES.REPORT_HISTORY_LIMIT_REACHED,
      `Free plan reports are limited to the last ${FREE_PLAN_REPORT_HISTORY_DAYS} days. Upgrade to Premium for full history.`,
      403,
    );
  }

  next();
}

/** Bloqueia (403) recursos exclusivos do plano Premium, sem relacao com janela de datas. */
export function requirePremium(featureName: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    if (req.user.plan === PLAN.FREE) {
      throw new AppError(
        ERROR_CODES.PREMIUM_FEATURE_REQUIRED,
        `${featureName} is available on the Premium plan only.`,
        403,
      );
    }

    next();
  };
}
