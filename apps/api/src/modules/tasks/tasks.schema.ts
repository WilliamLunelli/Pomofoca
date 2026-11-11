import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    completed: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const subjectIdParamSchema = z.object({
  subjectId: z.string().uuid(),
});
export type SubjectIdParam = z.infer<typeof subjectIdParamSchema>;

export const taskIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type TaskIdParam = z.infer<typeof taskIdParamSchema>;
