import { prisma } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { ERROR_CODES } from '../../shared/errors/errorCodes';
import type { CreateSubjectInput, UpdateSubjectInput } from './subjects.schema';

async function findOwnedSubject(userId: string, id: string) {
  const subject = await prisma.subject.findFirst({ where: { id, userId } });
  if (!subject) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Subject not found', 404);
  }
  return subject;
}

export async function createSubject(userId: string, input: CreateSubjectInput) {
  return prisma.subject.create({
    data: {
      userId,
      name: input.name,
      color: input.color,
      icon: input.icon,
      weeklyGoalMinutes: input.weeklyGoalMinutes,
    },
  });
}

export async function listSubjects(userId: string, includeArchived: boolean) {
  return prisma.subject.findMany({
    where: includeArchived ? { userId } : { userId, archived: false },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getSubject(userId: string, id: string) {
  return findOwnedSubject(userId, id);
}

export async function updateSubject(
  userId: string,
  id: string,
  input: UpdateSubjectInput,
) {
  await findOwnedSubject(userId, id);
  return prisma.subject.update({ where: { id }, data: input });
}

export async function archiveSubject(userId: string, id: string) {
  await findOwnedSubject(userId, id);
  return prisma.subject.update({ where: { id }, data: { archived: true } });
}

export async function restoreSubject(userId: string, id: string) {
  await findOwnedSubject(userId, id);
  return prisma.subject.update({ where: { id }, data: { archived: false } });
}

export async function countActiveSubjects(userId: string) {
  return prisma.subject.count({ where: { userId, archived: false } });
}
