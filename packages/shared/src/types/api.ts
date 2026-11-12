import type { Plan } from './plan';
import type { SessionType } from './session';

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

export interface Task {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  completed: boolean;
  completedAt: string | null;
  order: number;
  createdAt: string;
}

export interface RoutineBlock {
  id: string;
  userId: string;
  subjectId: string | null;
  dayOfWeek: number; // 0-6, domingo=0
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  label: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PomodoroSession {
  id: string;
  userId: string;
  subjectId: string | null;
  taskId: string | null;
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

export interface ActiveTimerState {
  subjectId: string | null;
  mode: 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';
  cycle: number;
  remainingSeconds: number;
  totalSeconds: number;
  status: 'running' | 'paused';
  updatedAt: string;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  dailyReminderEnabled: boolean;
  streakRiskEnabled: boolean;
  weeklySummaryEnabled: boolean;
  learnedReminderTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsightItem {
  type: 'peak_hours' | 'weak_day' | 'neglected_subject' | 'interruption_pattern';
  title: string;
  description: string;
  dataPoints: number;
}

export interface InsightsResponse {
  hasEnoughData: boolean;
  generatedAt: string | null;
  missingDays: number;
  missingSessions: number;
  insights: InsightItem[];
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
