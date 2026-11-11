import { z } from 'zod';

const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected time in "HH:mm" format');

export const createRoutineBlockSchema = z
  .object({
    subjectId: z.string().uuid().optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    label: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type CreateRoutineBlockInput = z.infer<typeof createRoutineBlockSchema>;

export const updateRoutineBlockSchema = z
  .object({
    subjectId: z.string().uuid().nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: timeStringSchema.optional(),
    endTime: timeStringSchema.optional(),
    label: z.string().trim().max(100).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
  .refine((data) => !(data.startTime && data.endTime) || data.endTime > data.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
export type UpdateRoutineBlockInput = z.infer<typeof updateRoutineBlockSchema>;

export const routineBlockIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type RoutineBlockIdParam = z.infer<typeof routineBlockIdParamSchema>;
