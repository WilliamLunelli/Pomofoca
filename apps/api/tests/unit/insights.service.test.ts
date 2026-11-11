// insights.service.ts tambem exporta funcoes que tocam o banco (getInsights,
// computeInsightsForUser) - importar o modulo dispara o $connect() de nivel de
// modulo em config/database.ts mesmo so testando as funcoes puras, entao precisa
// do mock igual reports.service.test.ts, senao o processo do Jest morre no fim
// com uma tentativa real de conexao ao Postgres.
jest.mock('../../src/config/database', () => ({
  prisma: {},
}));

import {
  computeInterruptionPattern,
  computeNeglectedSubject,
  computePeakHours,
  computeWeakDay,
  type DailyStatRecord,
  type SessionRecord,
  type SubjectRecord,
} from '../../src/modules/insights/insights.service';

const TZ = 'UTC';

function session(
  hour: number,
  completed: boolean,
  subjectId: string | null = null,
): SessionRecord {
  return {
    startedAt: new Date(Date.UTC(2026, 0, 5, hour, 0, 0)),
    completed,
    subjectId,
  };
}

describe('insights.service - computePeakHours', () => {
  it('reports the block with the best completion rate above the overall average', () => {
    const sessions: SessionRecord[] = [
      // Bloco 18h-20h: 6 completas, 0 interrompidas (100%)
      ...Array.from({ length: 6 }, () => session(19, true)),
      // Resto do dia: 4 completas, 6 interrompidas (40%)
      ...Array.from({ length: 4 }, () => session(9, true)),
      ...Array.from({ length: 6 }, () => session(9, false)),
    ];

    const result = computePeakHours(sessions, TZ);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('peak_hours');
    expect(result?.description).toContain('18h-20h');
    expect(result?.dataPoints).toBe(6);
  });

  it('returns null when no block reaches the minimum sample size', () => {
    const sessions: SessionRecord[] = [session(19, true), session(19, true)];
    expect(computePeakHours(sessions, TZ)).toBeNull();
  });

  it('breaks ties between equally-good blocks by picking the earliest one', () => {
    const sessions: SessionRecord[] = [
      ...Array.from({ length: 5 }, () => session(1, true)), // bloco 0h-2h
      ...Array.from({ length: 5 }, () => session(19, true)), // bloco 18h-20h
      ...Array.from({ length: 5 }, () => session(9, false)), // baixa a media geral
    ];

    const result = computePeakHours(sessions, TZ);

    expect(result?.description).toContain('0h-2h');
  });
});

function dailyStat(dateStr: string, focusSeconds: number): DailyStatRecord {
  return { date: new Date(`${dateStr}T00:00:00.000Z`), focusSeconds, bySubject: {} };
}

describe('insights.service - computeWeakDay', () => {
  const now = new Date('2026-02-28T12:00:00.000Z'); // sabado

  it('identifies a consistently weaker weekday against the others', () => {
    const stats: DailyStatRecord[] = [];
    // 8 semanas pra tras a partir de 2026-02-28 (sabado); marca todas as
    // sextas-feiras (weekday 5) com pouco estudo, outros dias com bastante.
    for (let i = 0; i < 56; i += 1) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isFriday = day.getUTCDay() === 5;
      stats.push(dailyStat(day.toISOString().slice(0, 10), isFriday ? 300 : 3000));
    }

    const result = computeWeakDay(stats, now);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('weak_day');
    expect(result?.title).toContain('exta'); // "Sextas" (maiuscula variavel por acento)
  });

  it('returns null when the weakest day does not have enough weeks of data', () => {
    // So 2 sextas com dado (< WEAK_DAY_MIN_WEEKS_WITH_DATA = 4) - o resto zerado
    // tambem nao ajuda, ja que sem dado em lugar nenhum nao ha "mais fraco" valido.
    const stats: DailyStatRecord[] = [
      dailyStat('2026-01-02', 100), // sexta
      dailyStat('2026-01-09', 100), // sexta
    ];

    expect(computeWeakDay(stats, now)).toBeNull();
  });
});

function subject(
  id: string,
  weeklyGoalMinutes: number,
  createdDaysAgo: number,
  now: Date,
): SubjectRecord {
  return {
    id,
    name: id,
    weeklyGoalMinutes,
    createdAt: new Date(now.getTime() - createdDaysAgo * 24 * 60 * 60 * 1000),
  };
}

describe('insights.service - computeNeglectedSubject', () => {
  const now = new Date('2026-02-28T12:00:00.000Z');

  it('reports the subject furthest below its own weekly goal', () => {
    const subjects = [subject('Química', 300, 30, now), subject('Cálculo', 300, 30, now)];
    const stats: DailyStatRecord[] = [
      {
        date: new Date('2026-02-20T00:00:00.000Z'),
        focusSeconds: 0,
        bySubject: {
          Química: { seconds: 60 * 60, completed: 1 }, // 60min / 600min meta (2 semanas) = 10%
          Cálculo: { seconds: 500 * 60, completed: 5 }, // 500/600 = 83%
        },
      },
    ];

    const result = computeNeglectedSubject(subjects, stats, now);

    expect(result).not.toBeNull();
    expect(result?.description).toContain('Química');
  });

  it('excludes subjects whose goal was set less than 2 weeks ago', () => {
    const subjects = [subject('Nova Matéria', 300, 3, now)];
    const stats: DailyStatRecord[] = [
      {
        date: new Date('2026-02-20T00:00:00.000Z'),
        focusSeconds: 0,
        bySubject: { 'Nova Matéria': { seconds: 0, completed: 0 } },
      },
    ];

    expect(computeNeglectedSubject(subjects, stats, now)).toBeNull();
  });

  it('does not report a subject that is reasonably close to its goal', () => {
    const subjects = [subject('Química', 300, 30, now)];
    const stats: DailyStatRecord[] = [
      {
        date: new Date('2026-02-20T00:00:00.000Z'),
        focusSeconds: 0,
        // 500min / 600min meta (2 semanas de 300min) = 83%, acima do piso de 60%
        bySubject: { Química: { seconds: 500 * 60, completed: 5 } },
      },
    ];

    expect(computeNeglectedSubject(subjects, stats, now)).toBeNull();
  });
});

describe('insights.service - computeInterruptionPattern', () => {
  it('flags a subject with a much higher interruption rate than average', () => {
    const sessions: SessionRecord[] = [
      ...Array.from({ length: 10 }, () => session(10, false, 'subject-a')),
      ...Array.from({ length: 10 }, () => session(10, true, 'subject-a')),
      ...Array.from({ length: 20 }, () => session(10, true, 'subject-b')),
    ];

    const result = computeInterruptionPattern(sessions, TZ);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('interruption_pattern');
    expect(result?.description).toContain('subject-a');
  });

  it('returns null below the minimum total interrupted-session floor', () => {
    const sessions: SessionRecord[] = [
      ...Array.from({ length: 5 }, () => session(10, false, 'subject-a')),
      ...Array.from({ length: 20 }, () => session(10, true, 'subject-b')),
    ];

    expect(computeInterruptionPattern(sessions, TZ)).toBeNull();
  });

  it('returns null when the gap versus the average is below the significance floor', () => {
    // Taxa de interrupcao uniforme (~33%) em tudo - nenhum contexto se destaca.
    const sessions: SessionRecord[] = [
      ...Array.from({ length: 10 }, () => session(10, false, 'subject-a')),
      ...Array.from({ length: 20 }, () => session(10, true, 'subject-a')),
      ...Array.from({ length: 10 }, () => session(10, false, 'subject-b')),
      ...Array.from({ length: 20 }, () => session(10, true, 'subject-b')),
    ];

    expect(computeInterruptionPattern(sessions, TZ)).toBeNull();
  });
});
