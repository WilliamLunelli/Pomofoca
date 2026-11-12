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
  computeRoutineMismatch,
  computeWeakDay,
  type DailyStatRecord,
  type RoutineBlockRecord,
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

describe('insights.service - computeRoutineMismatch', () => {
  const TZ_SP = 'America/Sao_Paulo';
  // Quarta-feira, 4 de março de 2026 às 12:00 UTC (09:00 em São Paulo)
  const now = new Date('2026-03-04T12:00:00.000Z');

  it('detects routine mismatch when user consistently studies at a different time', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2, // terça
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    // 4 últimas terças: 2026-02-10, 2026-02-17, 2026-02-24, 2026-03-03
    // 23:00Z = 20h em São Paulo (UTC-3), bloco 20h-22h
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('routine_mismatch');
    expect(result?.title).toBe('Rotina fora do compasso');
    expect(result?.description).toContain('Cálculo');
    expect(result?.description).toContain('20h-22h');
    expect(result?.dataPoints).toBe(4);
  });

  it('ignores blocks without subjectId (returns null)', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: null,
      active: true,
    };
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).toBeNull();
  });

  it('returns null when off-schedule sample is insufficient (< 3 occurrences)', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    // Apenas 2 terças fora do horário
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).toBeNull();
  });

  it('returns null when the block is followed on schedule in most occurrences', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    // 3 terças no horário (14:30 em SP = 17:30Z) e 1 terça fora (20:00 em SP = 23:00Z)
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T17:30:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T17:30:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T17:30:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).toBeNull();
  });

  it('returns null when the block is inactive', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: false,
    };
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).toBeNull();
  });

  it('handles timezone offset crossing calendar day (01:00Z Wednesday is 22h Tuesday in Sao Paulo)', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2, // terça 14h-16h
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    // 01:00Z de quarta é 22:00 de terça em SP (UTC-3), caindo no bloco 22h-24h
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-11T01:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-18T01:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-25T01:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-04T01:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).not.toBeNull();
    expect(result?.description).toContain('Cálculo');
    expect(result?.description).toContain('22h-24h');
  });

  it('breaks ties between equal-ratio blocks by picking the earlier day of the week', () => {
    const mondayBlock: RoutineBlockRecord = {
      dayOfWeek: 1, // segunda
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    const tuesdayBlock: RoutineBlockRecord = {
      dayOfWeek: 2, // terça
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-fisica',
      active: true,
    };

    // 4 segundas às 20h SP (23:00Z): 2026-02-09, 2026-02-16, 2026-02-23, 2026-03-02
    // 4 terças às 20h SP (23:00Z): 2026-02-10, 2026-02-17, 2026-02-24, 2026-03-03
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-09T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-16T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-23T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-02T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-10T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
    ];
    const subjects = [
      { id: 'sub-calculo', name: 'Cálculo' },
      { id: 'sub-fisica', name: 'Física' },
    ];

    // Passa tuesdayBlock antes de mondayBlock para garantir independência da ordem no array
    const result = computeRoutineMismatch([tuesdayBlock, mondayBlock], sessions, subjects, TZ_SP, now);

    expect(result).not.toBeNull();
    expect(result?.description).toContain('Cálculo');
    expect(result?.description).toContain('segundas');
  });

  it('breaks ties between equal-ratio blocks on the same day by picking earlier startTime', () => {
    const morningBlock: RoutineBlockRecord = {
      dayOfWeek: 2, // terça
      startTime: '08:00',
      endTime: '10:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    const afternoonBlock: RoutineBlockRecord = {
      dayOfWeek: 2, // terça
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-fisica',
      active: true,
    };

    // Ambas com 4 terças às 20h SP
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-10T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-fisica', durationSeconds: 3000 },
    ];
    const subjects = [
      { id: 'sub-calculo', name: 'Cálculo' },
      { id: 'sub-fisica', name: 'Física' },
    ];

    // Passa afternoonBlock antes de morningBlock
    const result = computeRoutineMismatch([afternoonBlock, morningBlock], sessions, subjects, TZ_SP, now);

    expect(result).not.toBeNull();
    expect(result?.description).toContain('Cálculo');
    expect(result?.description).toContain('08:00-10:00');
  });

  it('ignores blocks whose subject is not in the subjects list', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-inexistente',
      active: true,
    };
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T23:00:00.000Z'), completed: true, subjectId: 'sub-inexistente', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-inexistente', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-inexistente', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T23:00:00.000Z'), completed: true, subjectId: 'sub-inexistente', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).toBeNull();
  });

  it('returns null when off-schedule sessions are dispersed across different 2h blocks (< 3 in any block)', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    // 4 terças, cada uma em um bloco diferente (08h, 10h, 18h, 22h locais em SP)
    // 08h SP = 11:00Z, 10h SP = 13:00Z, 18h SP = 21:00Z, 22h SP = 01:00Z (quarta)
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T11:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-17T13:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T21:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-04T01:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).toBeNull();
  });

  it('recognizes session as on-schedule when duration overlaps block interval', () => {
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    // Sessão começou 13:30 (16:30Z) e dura 60min (até 14:30), sobrepondo 14:00-16:00
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-10T16:30:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3600 },
      { startedAt: new Date('2026-02-17T16:30:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3600 },
      { startedAt: new Date('2026-02-24T16:30:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3600 },
      { startedAt: new Date('2026-03-03T16:30:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3600 },
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, now);

    expect(result).toBeNull();
  });

  it('does not count sessions from today (incomplete day)', () => {
    const tuesdayNow = new Date('2026-03-03T18:00:00.000Z'); // terça-feira às 15h SP
    const block: RoutineBlockRecord = {
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '16:00',
      subjectId: 'sub-calculo',
      active: true,
    };
    // 2 terças anteriores fora do horário + 1 sessão hoje fora do horário (totalizaria 3 se hoje contasse)
    const sessions: SessionRecord[] = [
      { startedAt: new Date('2026-02-17T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-02-24T23:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 },
      { startedAt: new Date('2026-03-03T11:00:00.000Z'), completed: true, subjectId: 'sub-calculo', durationSeconds: 3000 }, // hoje às 08h SP
    ];
    const subjects = [{ id: 'sub-calculo', name: 'Cálculo' }];

    const result = computeRoutineMismatch([block], sessions, subjects, TZ_SP, tuesdayNow);

    expect(result).toBeNull();
  });
});

