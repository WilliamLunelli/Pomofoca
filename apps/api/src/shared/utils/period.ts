export type Period = 'today' | 'week' | 'month' | 'year' | 'all';

export interface DateRange {
  from: Date | null;
  to: Date;
}

export function startOfUTCDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUTCDate(date: Date): Date {
  return new Date(startOfUTCDate(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function addUTCDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
};

/** Janela rolante ancorada em `now` (ex: "week" = últimos 7 dias, incluindo hoje). */
export function resolvePeriodRange(period: Period, now: Date = new Date()): DateRange {
  const to = endOfUTCDate(now);
  if (period === 'all') {
    return { from: null, to };
  }
  const days = PERIOD_DAYS[period];
  return { from: startOfUTCDate(addUTCDays(now, -(days - 1))), to };
}

/** from/to explícitos têm prioridade sobre period; sem nenhum dos dois, cai em "week". */
export function resolveExplicitOrPeriodRange(
  period: Period | undefined,
  from: Date | undefined,
  to: Date | undefined,
  now: Date = new Date(),
): DateRange {
  if (from || to) {
    return {
      from: from ? startOfUTCDate(from) : null,
      to: to ? endOfUTCDate(to) : endOfUTCDate(now),
    };
  }
  return resolvePeriodRange(period ?? 'week', now);
}
