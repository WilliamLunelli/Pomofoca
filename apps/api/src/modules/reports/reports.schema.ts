import { z } from 'zod';

export const periodSchema = z.enum(['today', 'week', 'month', 'year', 'all']);

export const summaryQuerySchema = z.object({
  period: periodSchema.default('week'),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const rangeQuerySchema = z.object({
  period: periodSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export const heatmapQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()),
});
export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;

export const trendQuerySchema = rangeQuerySchema.extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});
export type TrendQuery = z.infer<typeof trendQuerySchema>;

export const compareQuerySchema = z.object({
  period: z.enum(['today', 'week', 'month', 'year']).default('week'),
});
export type CompareQuery = z.infer<typeof compareQuerySchema>;
