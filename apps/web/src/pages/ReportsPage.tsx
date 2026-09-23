import { Flame, Lock } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';

import { Foki } from '@/components/Foki';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import type {
  ReportBreakdown,
  ReportHeatmap,
  ReportStreak,
  ReportSummary,
  ReportTrend,
} from '@/lib/types';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: '30 dias' },
  { value: 'year', label: '1 ano' },
  { value: 'all', label: 'Tudo' },
];

const HEATMAP_LEVEL_COLOR = [
  'var(--f-track)',
  'var(--color-accent-200)',
  'var(--color-accent-400)',
  'var(--color-accent-600)',
  'var(--color-accent-800)',
];

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function ReportsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('week');

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [breakdown, setBreakdown] = useState<ReportBreakdown | null>(null);
  const [trend, setTrend] = useState<ReportTrend | null>(null);
  const [streak, setStreak] = useState<ReportStreak | null>(null);
  const [heatmap, setHeatmap] = useState<ReportHeatmap | null>(null);
  const [heatmapLocked, setHeatmapLocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setBlocked(false);
    try {
      const [summaryData, breakdownData, trendData, streakData] = await Promise.all([
        api.get<ReportSummary>(`/reports/summary?period=${period}`),
        api.get<ReportBreakdown>(`/reports/breakdown?period=${period}`),
        api.get<ReportTrend>(`/reports/trend?period=${period}&granularity=day`),
        api.get<ReportStreak>('/reports/streak'),
      ]);
      setSummary(summaryData);
      setBreakdown(breakdownData);
      setTrend(trendData);
      setStreak(streakData);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REPORT_HISTORY_LIMIT_REACHED') {
        setBlocked(true);
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const year = new Date().getUTCFullYear();
    api
      .get<ReportHeatmap>(`/reports/heatmap?year=${year}`)
      .then(setHeatmap)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'PREMIUM_FEATURE_REQUIRED') {
          setHeatmapLocked(true);
        }
      });
  }, []);

  const donutData = useMemo(
    () =>
      (breakdown?.subjects ?? []).map((s) => ({
        name: s.name,
        value: s.minutes,
        color: s.color ?? 'var(--f-muted)',
      })),
    [breakdown],
  );

  const trendData = useMemo(
    () =>
      (trend?.points ?? []).map((p) => ({
        label: p.from.slice(5),
        minutes: p.minutes,
      })),
    [trend],
  );

  const heatmapWeeks = useMemo(() => {
    if (!heatmap) return [];
    const weeks: (typeof heatmap.days)[number][][] = [];
    let currentWeek: (typeof heatmap.days)[number][] = [];
    for (const day of heatmap.days) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length) weeks.push(currentWeek);
    return weeks;
  }, [heatmap]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <h3 className="text-xl">Relatórios</h3>
          {summary && (
            <div className="text-sm text-muted">
              {summary.from ?? 'desde o início'} até {summary.to} · {summary.activeDays}{' '}
              dias ativos
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className="rounded-sm border px-2.5 py-1.5 text-xs transition-colors"
              style={{
                borderColor:
                  period === p.value ? 'var(--color-accent)' : 'var(--color-divider)',
                background:
                  period === p.value ? 'var(--color-accent-tint)' : 'transparent',
                color: period === p.value ? 'var(--color-accent)' : 'var(--color-text)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Carregando…</p>}

      {blocked && (
        <div className="card flex items-center gap-4 p-6">
          <Lock size={20} className="text-accent" />
          <div className="flex-1 text-sm text-muted">
            Plano gratuito mostra só os últimos 7 dias. Assine o Premium para ver este
            período.
          </div>
          <Link to="/subscription" className="btn btn-secondary">
            Ver planos
          </Link>
        </div>
      )}

      {!blocked && summary && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="card p-6">
              <h6 className="mb-3">Minutos estudados</h6>
              <div className="font-heading text-2xl tabular-nums">
                {formatMinutes(summary.studyMinutes)}
              </div>
            </div>
            <div className="card p-6">
              <h6 className="mb-3">Sessões completas</h6>
              <div className="font-heading text-2xl tabular-nums">
                {summary.sessionsCompleted}
              </div>
            </div>
            <div className="card p-6">
              <h6 className="mb-3">Taxa de conclusão</h6>
              <div className="font-heading text-2xl tabular-nums">
                {Math.round(summary.completionRate * 100)}%
              </div>
            </div>
            <div className="card p-6">
              <h6 className="mb-3">Dias ativos</h6>
              <div className="font-heading text-2xl tabular-nums">
                {summary.activeDays}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-8">
              <h6 className="mb-6">Distribuição por matéria</h6>
              {donutData.length > 0 ? (
                <div className="flex items-center gap-8">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        innerRadius={44}
                        outerRadius={68}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMinutes(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-1 flex-col gap-3">
                    {breakdown?.subjects.map((s) => (
                      <div
                        key={s.subjectId ?? 'none'}
                        className="flex items-center gap-2 text-[13px]"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: s.color ?? 'var(--f-muted)' }}
                        />
                        <span className="flex-1">{s.name}</span>
                        <span className="tabular-nums text-muted">
                          {formatMinutes(s.minutes)}
                        </span>
                        <span className="w-10 text-right tabular-nums">
                          {s.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Nenhuma sessão registrada neste período.
                </p>
              )}
            </div>

            <div className="card p-8">
              <h6 className="mb-6">Evolução · minutos por dia</h6>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trendData}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--f-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(v: number) => formatMinutes(v)} />
                  <Bar
                    dataKey="minutes"
                    fill="var(--color-accent)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {streak && (
            <div className="card flex items-center gap-4 p-6">
              <Foki state={streak.currentStreak > 0 ? 'idle' : 'sleeping'} size={44} />
              <Flame weight="fill" size={28} className="text-cta" />
              <div>
                <div className="font-heading text-xl tabular-nums">
                  {streak.currentStreak} dias
                </div>
                <div className="text-xs text-muted">
                  sequência atual · recorde {streak.recordStreak}
                  {streak.scope === 'week' && ' (últimos 7 dias, plano gratuito)'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card mt-6 p-8">
        <div className="mb-6 flex items-center justify-between">
          <h6 className="m-0">Intensidade por dia · {new Date().getUTCFullYear()}</h6>
          {heatmapLocked && (
            <Link
              to="/subscription"
              className="flex items-center gap-1.5 text-xs text-accent"
            >
              <Lock size={13} /> recurso Premium
            </Link>
          )}
        </div>
        {heatmapLocked ? (
          <p className="text-sm text-muted">
            O heatmap anual é exclusivo do plano Premium.{' '}
            <Link to="/subscription" className="text-accent">
              Assine para desbloquear
            </Link>
            .
          </p>
        ) : heatmap ? (
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-[3px]">
              {heatmapWeeks.map((week, i) => (
                <div key={i} className="flex flex-col gap-[3px]">
                  {week.map((day) => (
                    <span
                      key={day.date}
                      title={`${day.date} · ${formatMinutes(day.minutes)}`}
                      className="h-[11px] w-[11px] rounded-[2px]"
                      style={{ background: HEATMAP_LEVEL_COLOR[day.level] }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Carregando…</p>
        )}
      </div>

      {user?.plan === 'FREE' && !blocked && (
        <p className="mt-6 text-xs text-muted">
          Plano gratuito: relatórios limitados aos últimos 7 dias.{' '}
          <Link to="/subscription" className="text-accent">
            Assine o Premium
          </Link>{' '}
          para ver o histórico completo.
        </p>
      )}
    </div>
  );
}
