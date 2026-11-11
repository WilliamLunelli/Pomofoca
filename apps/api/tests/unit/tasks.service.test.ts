import { AppError } from '../../src/shared/errors/AppError';
import { ERROR_CODES } from '../../src/shared/errors/errorCodes';

const taskMock = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  prisma: { task: taskMock },
}));

jest.mock('../../src/modules/subjects/subjects.service', () => ({
  getSubject: jest.fn(),
}));

import { prisma } from '../../src/config/database';
import * as subjectsService from '../../src/modules/subjects/subjects.service';
import * as tasksService from '../../src/modules/tasks/tasks.service';

const mockedPrisma = prisma as unknown as { task: typeof taskMock };
const mockedSubjectsService = subjectsService as unknown as { getSubject: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tasks.service - createTask', () => {
  it('validates subject ownership and assigns the next order', async () => {
    mockedSubjectsService.getSubject.mockResolvedValueOnce({ id: 'subject-1' });
    mockedPrisma.task.findFirst.mockResolvedValueOnce({ order: 2 });
    mockedPrisma.task.create.mockResolvedValueOnce({ id: 'task-1' });

    await tasksService.createTask('user-1', 'subject-1', { title: 'Ler capítulo 3' });

    expect(mockedSubjectsService.getSubject).toHaveBeenCalledWith('user-1', 'subject-1');
    expect(mockedPrisma.task.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        subjectId: 'subject-1',
        title: 'Ler capítulo 3',
        order: 3,
      },
    });
  });

  it('starts order at 0 for the first task of a subject', async () => {
    mockedSubjectsService.getSubject.mockResolvedValueOnce({ id: 'subject-1' });
    mockedPrisma.task.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.task.create.mockResolvedValueOnce({ id: 'task-1' });

    await tasksService.createTask('user-1', 'subject-1', { title: 'Primeira tarefa' });

    expect(mockedPrisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ order: 0 }),
    });
  });

  it('propagates NOT_FOUND when the subject does not belong to the user', async () => {
    mockedSubjectsService.getSubject.mockRejectedValueOnce(
      new AppError(ERROR_CODES.NOT_FOUND, 'Subject not found', 404),
    );

    await expect(
      tasksService.createTask('user-1', 'someone-elses-subject', { title: 'x' }),
    ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.NOT_FOUND });
    expect(mockedPrisma.task.create).not.toHaveBeenCalled();
  });
});

describe('tasks.service - listTasks', () => {
  it('orders by completed then by manual order', async () => {
    mockedSubjectsService.getSubject.mockResolvedValueOnce({ id: 'subject-1' });
    mockedPrisma.task.findMany.mockResolvedValueOnce([]);

    await tasksService.listTasks('user-1', 'subject-1');

    expect(mockedPrisma.task.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', subjectId: 'subject-1' },
      orderBy: [{ completed: 'asc' }, { order: 'asc' }],
    });
  });
});

describe('tasks.service - updateTask', () => {
  it('throws NOT_FOUND for a task owned by someone else', async () => {
    mockedPrisma.task.findFirst.mockResolvedValueOnce(null);

    await expect(
      tasksService.updateTask('user-1', 'task-1', { title: 'x' }),
    ).rejects.toMatchObject<Partial<AppError>>({ code: ERROR_CODES.NOT_FOUND });
  });

  it('stamps completedAt when marking a task as completed', async () => {
    mockedPrisma.task.findFirst.mockResolvedValueOnce({ id: 'task-1', completed: false });
    mockedPrisma.task.update.mockResolvedValueOnce({ id: 'task-1', completed: true });

    await tasksService.updateTask('user-1', 'task-1', { completed: true });

    expect(mockedPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { completed: true, completedAt: expect.any(Date) },
    });
  });

  it('clears completedAt when marking a task back as incomplete', async () => {
    mockedPrisma.task.findFirst.mockResolvedValueOnce({ id: 'task-1', completed: true });
    mockedPrisma.task.update.mockResolvedValueOnce({ id: 'task-1', completed: false });

    await tasksService.updateTask('user-1', 'task-1', { completed: false });

    expect(mockedPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { completed: false, completedAt: null },
    });
  });

  it('does not touch completedAt when completed status is unchanged', async () => {
    mockedPrisma.task.findFirst.mockResolvedValueOnce({ id: 'task-1', completed: false });
    mockedPrisma.task.update.mockResolvedValueOnce({ id: 'task-1' });

    await tasksService.updateTask('user-1', 'task-1', { order: 5 });

    expect(mockedPrisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { order: 5 },
    });
  });
});

describe('tasks.service - deleteTask', () => {
  it('throws NOT_FOUND for a task owned by someone else', async () => {
    mockedPrisma.task.findFirst.mockResolvedValueOnce(null);

    await expect(tasksService.deleteTask('user-1', 'task-1')).rejects.toMatchObject<
      Partial<AppError>
    >({ code: ERROR_CODES.NOT_FOUND });
    expect(mockedPrisma.task.delete).not.toHaveBeenCalled();
  });

  it('deletes a task owned by the user', async () => {
    mockedPrisma.task.findFirst.mockResolvedValueOnce({ id: 'task-1' });

    await tasksService.deleteTask('user-1', 'task-1');

    expect(mockedPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
  });
});
