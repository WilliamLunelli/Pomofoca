export type Period = 'today' | 'week' | 'month' | 'year' | 'all';

export interface DateRange {
  from: Date | null;
  to: Date;
}

/**
 * Usado só para datas de calendário já explícitas (ex: query param
 * `?from=2026-01-01`) - NÃO reinterpreta por fuso horário, só arredonda pro dia.
 * Reinterpretar um `from`/`to` explícito pelo fuso do usuário estaria errado: se o
 * usuário pediu "2026-01-01", ele quer esse dia de calendário, não "o dia local
 * correspondente ao instante UTC meia-noite de 2026-01-01".
 */
export function startOfUTCDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUTCDate(date: Date): Date {
  return new Date(startOfUTCDate(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Converte um instante (UTC) no "dia de calendário local" do usuário, como um
 * surrogate UTC-midnight (mesmo formato usado em `DailyStudyStat.date`). Usar
 * sempre que um timestamp precisa virar "que dia foi isso pro usuário" - ex:
 * `PomodoroSession.startedAt` na hora de bucketizar, ou `new Date()` na hora de
 * resolver o que é "hoje"/"esta semana". `Intl.DateTimeFormat` já lida com DST e
 * historico de mudanças de fuso corretamente, sem precisar de lib externa.
 */
export function localDateSurrogate(instant: Date, timezone: string): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function endOfLocalDate(instant: Date, timezone: string): Date {
  return new Date(
    localDateSurrogate(instant, timezone).getTime() + 24 * 60 * 60 * 1000 - 1,
  );
}

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
};

/** Janela rolante ancorada em `now`, no fuso do usuário (ex: "week" = últimos 7 dias, incluindo hoje). */
export function resolvePeriodRange(
  period: Period,
  timezone: string,
  now: Date = new Date(),
): DateRange {
  const to = endOfLocalDate(now, timezone);
  if (period === 'all') {
    return { from: null, to };
  }
  const days = PERIOD_DAYS[period];
  return { from: localDateSurrogate(addDays(now, -(days - 1)), timezone), to };
}

/** from/to explícitos têm prioridade sobre period; sem nenhum dos dois, cai em "week". */
export function resolveExplicitOrPeriodRange(
  period: Period | undefined,
  from: Date | undefined,
  to: Date | undefined,
  timezone: string,
  now: Date = new Date(),
): DateRange {
  if (from || to) {
    return {
      from: from ? startOfUTCDate(from) : null,
      to: to ? endOfUTCDate(to) : endOfLocalDate(now, timezone),
    };
  }
  return resolvePeriodRange(period ?? 'week', timezone, now);
}
