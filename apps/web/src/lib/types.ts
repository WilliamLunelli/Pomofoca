import type { Plan, SessionType } from '@pomofoca/shared';

export interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  createdAt: string;
}

export interface Subject {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string | null;
  weeklyGoalMinutes: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PomodoroSession {
  id: string;
  userId: string;
  subjectId: string | null;
  type: SessionType;
  durationSeconds: number;
  completed: boolean;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
}

export interface ReportSummary {
  period: string;
  from: string | null;
  to: string;
  studyMinutes: number;
  sessionsCompleted: number;
  sessionsInterrupted: number;
  completionRate: number;
  activeDays: number;
}

export interface ReportBreakdownSubject {
  subjectId: string | null;
  name: string;
  color: string | null;
  minutes: number;
  percentage: number;
}

export interface ReportBreakdown {
  from: string | null;
  to: string;
  totalMinutes: number;
  subjects: ReportBreakdownSubject[];
}

export interface ReportHeatmapDay {
  date: string;
  minutes: number;
  sessionsCompleted: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ReportHeatmap {
  year: number;
  maxMinutesInDay: number;
  days: ReportHeatmapDay[];
}

export interface ReportTrendPoint {
  from: string;
  to: string;
  minutes: number;
  sessionsCompleted: number;
}

export interface ReportTrend {
  granularity: 'day' | 'week' | 'month';
  from: string | null;
  to: string;
  points: ReportTrendPoint[];
}

export interface ReportStreak {
  scope: 'week' | 'all';
  currentStreak: number;
  recordStreak: number;
  recordStreakDate: string | null;
}

export interface ReportCompare {
  period: string;
  current: { from: string; to: string; studyMinutes: number; sessionsCompleted: number };
  previous: { from: string; to: string; studyMinutes: number; sessionsCompleted: number };
  changePercentage: number;
}

export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface Subscription {
  id: string;
  userId: string;
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE';
  plan: Plan;
  billingCycle: BillingCycle;
  mercadoPagoSubscriptionId: string | null;
  startDate: string;
  endDate: string | null;
}
