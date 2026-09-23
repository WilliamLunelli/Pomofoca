import { z } from 'zod';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export const createSubjectSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(HEX_COLOR_REGEX, 'Color must be a hex value like #RRGGBB'),
  icon: z.string().trim().max(50).optional(),
  weeklyGoalMinutes: z.coerce.number().int().positive().optional(),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = createSubjectSchema.partial();
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;

export const subjectIdParamSchema = z.object({
  id: z.string().uuid(),
});
export type SubjectIdParam = z.infer<typeof subjectIdParamSchema>;

export const listSubjectsQuerySchema = z.object({
  archived: z.enum(['true', 'false']).optional(),
});
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;
