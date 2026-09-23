const dailyStudyStatMock = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  upsert: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  prisma: {
    dailyStudyStat: dailyStudyStatMock,
    subject: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../src/config/database';
import * as reportsService from '../../src/modules/reports/reports.service';

const mockedPrisma = prisma as unknown as {
  dailyStudyStat: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  subject: { findMany: jest.Mock };
};

const db = prisma as unknown as Parameters<
  typeof reportsService.recordCompletedSession
>[0];

const focusSession = {
  userId: 'user-1',
  subjectId: 'subject-1',
  type: 'FOCUS',
  durationSeconds: 1500,
  completed: true,
  startedAt: new Date('2026-01-05T10:00:00.000Z'),
};

describe('reports.service - recordCompletedSession', () => {
  it('creates a new daily stat row when none exists for the day', async () => {
    mockedPrisma.dailyStudyStat.findUnique.mockResolvedValueOnce(null);

    await reportsService.recordCompletedSession(db, focusSession);

    expect(mockedPrisma.dailyStudyStat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        date: new Date('2026-01-05T00:00:00.000Z'),
        totalSeconds: 1500,
        focusSeconds: 1500,
        sessionsCompleted: 1,
        sessionsInterrupted: 0,
        bySubject: { 'subject-1': { seconds: 1500, completed: 1 } },
      }),
    });
  });

  it('increments an existing daily stat row', async () => {
    mockedPrisma.dailyStudyStat.findUnique.mockResolvedValueOnce({
      totalSeconds: 600,
      focusSeconds: 600,
      sessionsCompleted: 1,
      sessionsInterrupted: 0,
      bySubject: { 'subject-1': { seconds: 600, completed: 1 } },
    });

    await reportsService.recordCompletedSession(db, focusSession);

    expect(mockedPrisma.dailyStudyStat.update).toHaveBeenCalledWith({
      where: {
        userId_date: { userId: 'user-1', date: new Date('2026-01-05T00:00:00.000Z') },
      },
      data: expect.objectContaining({
        totalSeconds: 2100,
        focusSeconds: 2100,
        sessionsCompleted: 2,
        sessionsInterrupted: 0,
        bySubject: { 'subject-1': { seconds: 2100, completed: 2 } },
      }),
    });
  });

  it('does not count break sessions towards focus metrics', async () => {
    mockedPrisma.dailyStudyStat.findUnique.mockResolvedValueOnce(null);

    await reportsService.recordCompletedSession(db, {
      ...focusSession,
      type: 'SHORT_BREAK',
      subjectId: null,
    });

    expect(mockedPrisma.dailyStudyStat.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        totalSeconds: 1500,
        focusSeconds: 0,
        sessionsCompleted: 0,
        sessionsInterrupted: 0,
        bySubject: {},
      }),
    });
  });

  it('reverses a session by decrementing the daily stat', async () => {
    mockedPrisma.dailyStudyStat.findUnique.mockResolvedValueOnce({
      totalSeconds: 1500,
      focusSeconds: 1500,
      sessionsCompleted: 1,
      sessionsInterrupted: 0,
      bySubject: { 'subject-1': { seconds: 1500, completed: 1 } },
    });

    await reportsService.reverseCompletedSession(db, focusSession);

    expect(mockedPrisma.dailyStudyStat.update).toHaveBeenCalledWith({
      where: {
        userId_date: { userId: 'user-1', date: new Date('2026-01-05T00:00:00.000Z') },
      },
      data: expect.objectContaining({
        totalSeconds: 0,
        focusSeconds: 0,
        sessionsCompleted: 0,
        sessionsInterrupted: 0,
        bySubject: {},
      }),
    });
  });
});

describe('reports.service - getSummary', () => {
  it('aggregates study minutes, sessions and completion rate over the period', async () => {
    mockedPrisma.dailyStudyStat.findMany.mockResolvedValueOnce([
      { focusSeconds: 1500, sessionsCompleted: 1, sessionsInterrupted: 1 },
      { focusSeconds: 3000, sessionsCompleted: 2, sessionsInterrupted: 0 },
      { focusSeconds: 0, sessionsCompleted: 0, sessionsInterrupted: 0 },
    ]);

    const result = await reportsService.getSummary('user-1', 'week');

    expect(result.studyMinutes).toBe(75);
    expect(result.sessionsCompleted).toBe(3);
    expect(result.sessionsInterrupted).toBe(1);
    expect(result.completionRate).toBe(0.75);
    expect(result.activeDays).toBe(2);
  });
});

describe('reports.service - getBreakdown', () => {
  it('merges bySubject across days and computes percentages', async () => {
    mockedPrisma.dailyStudyStat.findMany.mockResolvedValueOnce([
      {
        bySubject: {
          'subject-1': { seconds: 1200, completed: 1 },
          none: { seconds: 300, completed: 1 },
        },
      },
      { bySubject: { 'subject-1': { seconds: 300, completed: 1 } } },
    ]);
    mockedPrisma.subject.findMany.mockResolvedValueOnce([
      { id: 'subject-1', name: 'Matemática', color: '#FF5733' },
    ]);

    const result = await reportsService.getBreakdown(
      'user-1',
      'week',
      undefined,
      undefined,
    );

    expect(result.totalMinutes).toBe(30);
    expect(result.subjects).toEqual([
      {
        subjectId: 'subject-1',
        name: 'Matemática',
        color: '#FF5733',
        minutes: 25,
        percentage: 83.3,
      },
      { subjectId: null, name: 'Sem matéria', color: null, minutes: 5, percentage: 16.7 },
    ]);
  });
});

describe('reports.service - getHeatmap', () => {
  it('computes quartile-based levels relative to the busiest day in the year', async () => {
    mockedPrisma.dailyStudyStat.findMany.mockResolvedValueOnce([
      {
        date: new Date('2025-01-01T00:00:00.000Z'),
        focusSeconds: 6000,
        sessionsCompleted: 4,
      },
      {
        date: new Date('2025-01-02T00:00:00.000Z'),
        focusSeconds: 3000,
        sessionsCompleted: 2,
      },
      {
        date: new Date('2025-01-03T00:00:00.000Z'),
        focusSeconds: 1500,
        sessionsCompleted: 1,
      },
    ]);

    const result = await reportsService.getHeatmap('user-1', 2025);

    expect(result.maxMinutesInDay).toBe(100);
    expect(result.days).toHaveLength(365);
    expect(result.days[0]).toEqual({
      date: '2025-01-01',
      minutes: 100,
      sessionsCompleted: 4,
      level: 4,
    });
    expect(result.days[1]).toEqual({
      date: '2025-01-02',
      minutes: 50,
      sessionsCompleted: 2,
      level: 2,
    });
    expect(result.days[2]).toEqual({
      date: '2025-01-03',
      minutes: 25,
      sessionsCompleted: 1,
      level: 1,
    });
    expect(result.days[3]).toEqual({
      date: '2025-01-04',
      minutes: 0,
      sessionsCompleted: 0,
      level: 0,
    });
  });
});

describe('reports.service - getStreak', () => {
  it('computes the current streak ending today and the all-time record for premium users', async () => {
    const today = new Date();
    const todayUTC = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const yesterday = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(todayUTC.getTime() - 2 * 24 * 60 * 60 * 1000);

    mockedPrisma.dailyStudyStat.findMany.mockResolvedValueOnce([
      { date: twoDaysAgo },
      { date: yesterday },
      { date: todayUTC },
    ]);

    const result = await reportsService.getStreak('user-1', 'PREMIUM');

    expect(result.scope).toBe('all');
    expect(result.currentStreak).toBe(3);
    expect(result.recordStreak).toBe(3);
  });

  it('scopes the streak window to the last 7 days for free-plan users', async () => {
    mockedPrisma.dailyStudyStat.findMany.mockResolvedValueOnce([]);

    const result = await reportsService.getStreak('user-1', 'FREE');

    expect(result.scope).toBe('week');
    expect(mockedPrisma.dailyStudyStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});

describe('reports.service - getCompare', () => {
  it('computes the percentage change against the equivalent previous period', async () => {
    mockedPrisma.dailyStudyStat.findMany
      .mockResolvedValueOnce([{ focusSeconds: 6000, sessionsCompleted: 4 }])
      .mockResolvedValueOnce([{ focusSeconds: 3000, sessionsCompleted: 2 }]);

    const result = await reportsService.getCompare('user-1', 'week');

    expect(result.current.studyMinutes).toBe(100);
    expect(result.previous.studyMinutes).toBe(50);
    expect(result.changePercentage).toBe(100);
  });

  it('returns 0% change when both periods have no study time', async () => {
    mockedPrisma.dailyStudyStat.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await reportsService.getCompare('user-1', 'today');

    expect(result.changePercentage).toBe(0);
  });
});
