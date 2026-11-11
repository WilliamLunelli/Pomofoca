import { prisma } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { ERROR_CODES } from '../../shared/errors/errorCodes';
import * as subjectsService from '../subjects/subjects.service';
import type { CreateTaskInput, UpdateTaskInput } from './tasks.schema';

/** Exportado - sessions.service.ts reusa pra validar taskId antes de gravar uma sessao. */
export async function findOwnedTaskOrThrow(userId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Task not found', 404);
  }
  return task;
}
const findOwnedTask = findOwnedTaskOrThrow;

export async function createTask(
  userId: string,
  subjectId: string,
  input: CreateTaskInput,
) {
  await subjectsService.getSubject(userId, subjectId); // valida ownership da materia

  const last = await prisma.task.findFirst({
    where: { subjectId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  return prisma.task.create({
    data: {
      userId,
      subjectId,
      title: input.title,
      order: (last?.order ?? -1) + 1,
    },
  });
}

/** Pendentes primeiro, depois por `order` - reflete a prioridade que o usuario deu. */
export async function listTasks(userId: string, subjectId: string) {
  await subjectsService.getSubject(userId, subjectId);

  return prisma.task.findMany({
    where: { userId, subjectId },
    orderBy: [{ completed: 'asc' }, { order: 'asc' }],
  });
}

export async function updateTask(userId: string, id: string, input: UpdateTaskInput) {
  const existing = await findOwnedTask(userId, id);

  const completedChanged =
    input.completed !== undefined && input.completed !== existing.completed;

  return prisma.task.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.completed !== undefined && { completed: input.completed }),
      ...(input.order !== undefined && { order: input.order }),
      ...(completedChanged && { completedAt: input.completed ? new Date() : null }),
    },
  });
}

export async function deleteTask(userId: string, id: string) {
  await findOwnedTask(userId, id);
  await prisma.task.delete({ where: { id } });
}

/** Tarefas ativas (nao completas) de uma materia - usado pelo limite do plano FREE. */
export async function countActiveTasks(subjectId: string) {
  return prisma.task.count({ where: { subjectId, completed: false } });
}
