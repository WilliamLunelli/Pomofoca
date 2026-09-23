import { AppError } from '../../src/shared/errors/AppError';
import { ERROR_CODES } from '../../src/shared/errors/errorCodes';

jest.mock('../../src/config/database', () => ({
  prisma: {
    subject: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/config/database';
import * as subjectsService from '../../src/modules/subjects/subjects.service';

const mockedPrisma = prisma as unknown as {
  subject: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
};

const baseSubject = {
  id: 'subject-1',
  userId: 'user-1',
  name: 'Matemática',
  color: '#FF5733',
  icon: null,
  weeklyGoalMinutes: null,
  archived: false,
};

describe('subjects.service', () => {
  it('creates a subject scoped to the user', async () => {
    mockedPrisma.subject.create.mockResolvedValueOnce(baseSubject);

    const result = await subjectsService.createSubject('user-1', {
      name: 'Matemática',
      color: '#FF5733',
    });

    expect(mockedPrisma.subject.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Matemática',
        color: '#FF5733',
        icon: undefined,
        weeklyGoalMinutes: undefined,
      },
    });
    expect(result).toEqual(baseSubject);
  });

  it('lists only non-archived subjects by default', async () => {
    mockedPrisma.subject.findMany.mockResolvedValueOnce([baseSubject]);

    await subjectsService.listSubjects('user-1', false);

    expect(mockedPrisma.subject.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', archived: false },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('includes archived subjects when requested', async () => {
    mockedPrisma.subject.findMany.mockResolvedValueOnce([baseSubject]);

    await subjectsService.listSubjects('user-1', true);

    expect(mockedPrisma.subject.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('throws NOT_FOUND when getting a subject that does not belong to the user', async () => {
    mockedPrisma.subject.findFirst.mockResolvedValueOnce(null);

    await expect(subjectsService.getSubject('user-1', 'subject-1')).rejects.toMatchObject<
      Partial<AppError>
    >({ code: ERROR_CODES.NOT_FOUND });
  });

  it('archives a subject owned by the user', async () => {
    mockedPrisma.subject.findFirst.mockResolvedValueOnce(baseSubject);
    mockedPrisma.subject.update.mockResolvedValueOnce({ ...baseSubject, archived: true });

    const result = await subjectsService.archiveSubject('user-1', 'subject-1');

    expect(mockedPrisma.subject.update).toHaveBeenCalledWith({
      where: { id: 'subject-1' },
      data: { archived: true },
    });
    expect(result.archived).toBe(true);
  });

  it('counts only active subjects', async () => {
    mockedPrisma.subject.count.mockResolvedValueOnce(2);

    const count = await subjectsService.countActiveSubjects('user-1');

    expect(mockedPrisma.subject.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', archived: false },
    });
    expect(count).toBe(2);
  });
});
