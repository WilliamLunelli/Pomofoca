import { AppError } from '../../src/shared/errors/AppError';
import { ERROR_CODES } from '../../src/shared/errors/errorCodes';

jest.mock('../../src/config/database', () => ({
  prisma: {
    pomodoroSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../../src/modules/subjects/subjects.service', () => ({
  getSubject: jest.fn(),
}));

import { prisma } from '../../src/config/database';
import * as subjectsService from '../../src/modules/subjects/subjects.service';
import * as sessionsService from '../../src/modules/sessions/sessions.service';

const mockedPrisma = prisma as unknown as {
  pomodoroSession: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    delete: jest.Mock;
  };
};
const mockedSubjectsService = subjectsService as unknown as { getSubject: jest.Mock };

const startedAt = new Date('2026-01-01T10:00:00.000Z');
const finishedAt = new Date('2026-01-01T10:25:00.000Z');

const baseSession = {
  id: 'session-1',
  userId: 'user-1',
  subjectId: null,
  type: 'FOCUS',
  durationSeconds: 1500,
  completed: true,
  startedAt,
  finishedAt,
};

describe('sessions.service', () => {
  it('creates a free session with no subject', async () => {
    mockedPrisma.pomodoroSession.create.mockResolvedValueOnce(baseSession);

    const result = await sessionsService.createSession('user-1', {
      type: 'FOCUS',
      durationSeconds: 1500,
      completed: true,
      startedAt,
      finishedAt,
    });

    expect(mockedSubjectsService.getSubject).not.toHaveBeenCalled();
    expect(mockedPrisma.pomodoroSession.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        subjectId: undefined,
        type: 'FOCUS',
        durationSeconds: 1500,
        completed: true,
        startedAt,
        finishedAt,
      },
    });
    expect(result).toEqual(baseSession);
  });

  it('validates subject ownership before creating a session tied to a subject', async () => {
    mockedSubjectsService.getSubject.mockResolvedValueOnce({ id: 'subject-1' });
    mockedPrisma.pomodoroSession.create.mockResolvedValueOnce({
      ...baseSession,
      subjectId: 'subject-1',
    });

    await sessionsService.createSession('user-1', {
      subjectId: 'subject-1',
      type: 'FOCUS',
      durationSeconds: 1500,
      completed: true,
      startedAt,
      finishedAt,
    });

    expect(mockedSubjectsService.getSubject).toHaveBeenCalledWith('user-1', 'subject-1');
  });

  it('propagates NOT_FOUND when the subject does not belong to the user', async () => {
    mockedSubjectsService.getSubject.mockRejectedValueOnce(
      new AppError(ERROR_CODES.NOT_FOUND, 'Subject not found', 404),
    );

    await expect(
      sessionsService.createSession('user-1', {
        subjectId: 'someone-elses-subject',
        type: 'FOCUS',
        durationSeconds: 1500,
        completed: true,
        startedAt,
        finishedAt,
      }),
    ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.NOT_FOUND });
    expect(mockedPrisma.pomodoroSession.create).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when fetching a session owned by someone else', async () => {
    mockedPrisma.pomodoroSession.findFirst.mockResolvedValueOnce(null);

    await expect(sessionsService.getSession('user-1', 'session-1')).rejects.toMatchObject<
      Partial<AppError>
    >({ code: ERROR_CODES.NOT_FOUND });
  });

  it('deletes a session owned by the user', async () => {
    mockedPrisma.pomodoroSession.findFirst.mockResolvedValueOnce(baseSession);
    mockedPrisma.pomodoroSession.delete.mockResolvedValueOnce(baseSession);

    await sessionsService.deleteSession('user-1', 'session-1');

    expect(mockedPrisma.pomodoroSession.delete).toHaveBeenCalledWith({
      where: { id: 'session-1' },
    });
  });
});
