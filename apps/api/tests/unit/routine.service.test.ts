import { AppError } from '../../src/shared/errors/AppError';
import { ERROR_CODES } from '../../src/shared/errors/errorCodes';

const routineBlockMock = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  prisma: { routineBlock: routineBlockMock },
}));

jest.mock('../../src/modules/subjects/subjects.service', () => ({
  getSubject: jest.fn(),
}));

import { prisma } from '../../src/config/database';
import * as subjectsService from '../../src/modules/subjects/subjects.service';
import * as routineService from '../../src/modules/routine/routine.service';

const mockedPrisma = prisma as unknown as { routineBlock: typeof routineBlockMock };
const mockedSubjectsService = subjectsService as unknown as { getSubject: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('routine.service - createRoutineBlock', () => {
  it('creates a block without a subject (generic study block)', async () => {
    mockedPrisma.routineBlock.create.mockResolvedValueOnce({ id: 'block-1' });

    await routineService.createRoutineBlock('user-1', {
      dayOfWeek: 1,
      startTime: '19:00',
      endTime: '20:00',
    });

    expect(mockedSubjectsService.getSubject).not.toHaveBeenCalled();
    expect(mockedPrisma.routineBlock.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        subjectId: undefined,
        dayOfWeek: 1,
        startTime: '19:00',
        endTime: '20:00',
        label: undefined,
      },
    });
  });

  it('validates subject ownership when a subject is given', async () => {
    mockedSubjectsService.getSubject.mockResolvedValueOnce({ id: 'subject-1' });
    mockedPrisma.routineBlock.create.mockResolvedValueOnce({ id: 'block-1' });

    await routineService.createRoutineBlock('user-1', {
      subjectId: 'subject-1',
      dayOfWeek: 1,
      startTime: '19:00',
      endTime: '20:00',
    });

    expect(mockedSubjectsService.getSubject).toHaveBeenCalledWith('user-1', 'subject-1');
  });

  it('propagates NOT_FOUND when the subject does not belong to the user', async () => {
    mockedSubjectsService.getSubject.mockRejectedValueOnce(
      new AppError(ERROR_CODES.NOT_FOUND, 'Subject not found', 404),
    );

    await expect(
      routineService.createRoutineBlock('user-1', {
        subjectId: 'someone-elses-subject',
        dayOfWeek: 1,
        startTime: '19:00',
        endTime: '20:00',
      }),
    ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.NOT_FOUND });
    expect(mockedPrisma.routineBlock.create).not.toHaveBeenCalled();
  });
});

describe('routine.service - listRoutineBlocks', () => {
  it('orders by day of week then start time', async () => {
    mockedPrisma.routineBlock.findMany.mockResolvedValueOnce([]);

    await routineService.listRoutineBlocks('user-1');

    expect(mockedPrisma.routineBlock.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  });
});

describe('routine.service - updateRoutineBlock / deleteRoutineBlock', () => {
  it('throws NOT_FOUND when updating a block owned by someone else', async () => {
    mockedPrisma.routineBlock.findFirst.mockResolvedValueOnce(null);

    await expect(
      routineService.updateRoutineBlock('user-1', 'block-1', { active: false }),
    ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.NOT_FOUND });
  });

  it('throws NOT_FOUND when deleting a block owned by someone else', async () => {
    mockedPrisma.routineBlock.findFirst.mockResolvedValueOnce(null);

    await expect(
      routineService.deleteRoutineBlock('user-1', 'block-1'),
    ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.NOT_FOUND });
    expect(mockedPrisma.routineBlock.delete).not.toHaveBeenCalled();
  });

  it('deletes a block owned by the user', async () => {
    mockedPrisma.routineBlock.findFirst.mockResolvedValueOnce({ id: 'block-1' });

    await routineService.deleteRoutineBlock('user-1', 'block-1');

    expect(mockedPrisma.routineBlock.delete).toHaveBeenCalledWith({
      where: { id: 'block-1' },
    });
  });
});
