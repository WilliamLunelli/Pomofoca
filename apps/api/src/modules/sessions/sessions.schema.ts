import { SESSION_TYPE } from '@pomofoca/shared';
import { z } from 'zod';

const SESSION_TYPE_VALUES = Object.values(SESSION_TYPE) as [string, ...string[]];
const sessionTypeSchema = z.enum(SESSION_TYPE_VALUES);

export const createSessionSchema = z
  .object({
    subjectId: z.string().uuid().optional(),
    type: sessionTypeSchema,
    durationSeconds: z.coerce.number().int().positive(),
    completed: z.boolean().default(true),
    startedAt: z.coerce.date(),
    finishedAt: z.coerce.date(),
  })
  .refine((data) => data.finishedAt > data.startedAt, {
    message: 'finishedAt must be after startedAt',
    path: ['finishedAt'],
  });
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;

export const listSessionsQuerySchema = z.object({
  subjectId: z.string().uuid().optional(),
  type: sessionTypeSchema.optional(),
  completed: z.enum(['true', 'false']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
