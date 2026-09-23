import type { SessionType } from '@pomofoca/shared';

import { prisma } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { ERROR_CODES } from '../../shared/errors/errorCodes';
import * as reportsService from '../reports/reports.service';
import * as subjectsService from '../subjects/subjects.service';
import type { CreateSessionInput, ListSessionsQuery } from './sessions.schema';

async function findOwnedSession(userId: string, id: string) {
  const session = await prisma.pomodoroSession.findFirst({ where: { id, userId } });
  if (!session) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Session not found', 404);
  }
  return session;
}

export async function createSession(userId: string, input: CreateSessionInput) {
  if (input.subjectId) {
    await subjectsService.getSubject(userId, input.subjectId);
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.pomodoroSession.create({
      data: {
        userId,
        subjectId: input.subjectId,
        type: input.type as SessionType,
        durationSeconds: input.durationSeconds,
        completed: input.completed,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      },
    });

    await reportsService.recordCompletedSession(tx, session);

    return session;
  });
}

export async function listSessions(userId: string, query: ListSessionsQuery) {
  return prisma.pomodoroSession.findMany({
    where: {
      userId,
      subjectId: query.subjectId,
      type: query.type as SessionType | undefined,
      completed: query.completed === undefined ? undefined : query.completed === 'true',
      startedAt: {
        gte: query.from,
        lte: query.to,
      },
    },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getSession(userId: string, id: string) {
  return findOwnedSession(userId, id);
}

export async function deleteSession(userId: string, id: string) {
  const session = await findOwnedSession(userId, id);

  await prisma.$transaction(async (tx) => {
    await tx.pomodoroSession.delete({ where: { id } });
    await reportsService.reverseCompletedSession(tx, session);
  });
}
