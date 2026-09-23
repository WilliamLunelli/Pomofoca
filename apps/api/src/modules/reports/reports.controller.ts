import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as reportsService from './reports.service';
import type {
  CompareQuery,
  HeatmapQuery,
  RangeQuery,
  SummaryQuery,
  TrendQuery,
} from './reports.schema';

export async function summaryHandler(req: Request, res: Response) {
  const { period } = req.query as unknown as SummaryQuery;
  const data = await reportsService.getSummary(req.user!.id, period);
  return sendSuccess(res, data);
}

export async function breakdownHandler(req: Request, res: Response) {
  const { period, from, to } = req.query as unknown as RangeQuery;
  const data = await reportsService.getBreakdown(req.user!.id, period, from, to);
  return sendSuccess(res, data);
}

export async function heatmapHandler(req: Request, res: Response) {
  const { year } = req.query as unknown as HeatmapQuery;
  const data = await reportsService.getHeatmap(req.user!.id, year);
  return sendSuccess(res, data);
}

export async function trendHandler(req: Request, res: Response) {
  const { period, from, to, granularity } = req.query as unknown as TrendQuery;
  const data = await reportsService.getTrend(req.user!.id, period, from, to, granularity);
  return sendSuccess(res, data);
}

export async function streakHandler(req: Request, res: Response) {
  const data = await reportsService.getStreak(req.user!.id, req.user!.plan);
  return sendSuccess(res, data);
}

export async function compareHandler(req: Request, res: Response) {
  const { period } = req.query as unknown as CompareQuery;
  const data = await reportsService.getCompare(req.user!.id, period);
  return sendSuccess(res, data);
}
