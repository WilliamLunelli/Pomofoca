import { prisma } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { ERROR_CODES } from '../../shared/errors/errorCodes';
import type { UpdateUserInput } from './users.schema';

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  plan: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    createdAt: user.createdAt,
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
  }
  return toPublicUser(user);
}

export async function updateMe(userId: string, input: UpdateUserInput) {
  const user = await prisma.user.update({ where: { id: userId }, data: input });
  return toPublicUser(user);
}
