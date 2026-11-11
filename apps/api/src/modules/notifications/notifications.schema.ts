import { z } from 'zod';

export const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});
export type SubscribeInput = z.infer<typeof subscribeSchema>;

export const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;

export const updatePreferencesSchema = z.object({
  dailyReminderEnabled: z.boolean().optional(),
  streakRiskEnabled: z.boolean().optional(),
  weeklySummaryEnabled: z.boolean().optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
