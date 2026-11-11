import { prisma } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { ERROR_CODES } from '../../shared/errors/errorCodes';
import * as subjectsService from '../subjects/subjects.service';
import type { CreateRoutineBlockInput, UpdateRoutineBlockInput } from './routine.schema';

async function findOwnedBlock(userId: string, id: string) {
  const block = await prisma.routineBlock.findFirst({ where: { id, userId } });
  if (!block) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Routine block not found', 404);
  }
  return block;
}

export async function createRoutineBlock(userId: string, input: CreateRoutineBlockInput) {
  if (input.subjectId) {
    await subjectsService.getSubject(userId, input.subjectId); // valida ownership
  }

  return prisma.routineBlock.create({
    data: {
      userId,
      subjectId: input.subjectId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.label,
    },
  });
}

export async function listRoutineBlocks(userId: string) {
  return prisma.routineBlock.findMany({
    where: { userId },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

export async function updateRoutineBlock(
  userId: string,
  id: string,
  input: UpdateRoutineBlockInput,
) {
  await findOwnedBlock(userId, id);
  if (input.subjectId) {
    await subjectsService.getSubject(userId, input.subjectId);
  }

  return prisma.routineBlock.update({
    where: { id },
    data: {
      ...(input.subjectId !== undefined && { subjectId: input.subjectId }),
      ...(input.dayOfWeek !== undefined && { dayOfWeek: input.dayOfWeek }),
      ...(input.startTime !== undefined && { startTime: input.startTime }),
      ...(input.endTime !== undefined && { endTime: input.endTime }),
      ...(input.label !== undefined && { label: input.label }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
}

export async function deleteRoutineBlock(userId: string, id: string) {
  await findOwnedBlock(userId, id);
  await prisma.routineBlock.delete({ where: { id } });
}
