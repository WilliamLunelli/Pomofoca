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
import { usePreferences } from '@/context/PreferencesContext';
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

function toggleStyle(active: boolean) {
  return {
    borderColor: active ? 'var(--color-accent)' : 'var(--color-divider)',
    background: active ? 'var(--color-accent-tint)' : 'transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text)',
  };
}

export function ReportsPage() {
  const { user } = useAuth();
  const { reportsLayout, setReportsLayout } = usePreferences();
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

  const heatmapCard = (
    <div className="card p-8">
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
  );

  const streakCard = streak && (
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
  );

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
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className="rounded-sm border px-2.5 py-1.5 text-xs transition-colors"
                style={toggleStyle(period === p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setReportsLayout('narrative')}
              className="rounded-sm border px-2.5 py-1.5 text-[11px] transition-colors"
              style={toggleStyle(reportsLayout === 'narrative')}
            >
              Narrativa
            </button>
            <button
              onClick={() => setReportsLayout('dense')}
              className="rounded-sm border px-2.5 py-1.5 text-[11px] transition-colors"
              style={toggleStyle(reportsLayout === 'dense')}
            >
              Denso
            </button>
          </div>
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

      {!blocked && summary && reportsLayout === 'narrative' && (
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

          {streakCard}
          {heatmapCard}
        </div>
      )}

      {!blocked && summary && reportsLayout === 'dense' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex flex-col gap-6">
            {heatmapCard}

            <div className="card p-8">
              <h6 className="mb-6">Evolução · minutos por dia</h6>
              <ResponsiveContainer width="100%" height={160}>
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

            <div className="card overflow-x-auto p-8">
              <h6 className="mb-6">Matérias · período selecionado</h6>
              {breakdown && breakdown.subjects.length > 0 ? (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-muted">
                      <th className="pb-2 font-normal">Matéria</th>
                      <th className="pb-2 text-right font-normal">Minutos</th>
                      <th className="pb-2 text-right font-normal">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.subjects.map((s) => (
                      <tr key={s.subjectId ?? 'none'} className="border-t border-divider">
                        <td className="py-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: s.color ?? 'var(--f-muted)' }}
                            />
                            {s.name}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatMinutes(s.minutes)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{s.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted">
                  Nenhuma sessão registrada neste período.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {streakCard}

            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Minutos</h6>
              <div className="font-heading text-xl tabular-nums">
                {formatMinutes(summary.studyMinutes)}
              </div>
            </div>
            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Sessões</h6>
              <div className="font-heading text-xl tabular-nums">
                {summary.sessionsCompleted}
              </div>
            </div>
            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Conclusão</h6>
              <div className="font-heading text-xl tabular-nums">
                {Math.round(summary.completionRate * 100)}%
              </div>
            </div>
            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Dias ativos</h6>
              <div className="font-heading text-xl tabular-nums">
                {summary.activeDays}
              </div>
            </div>

            {donutData.length > 0 && (
              <div className="card p-4">
                <h6 className="mb-3">Distribuição</h6>
                <div className="mb-3 flex h-2.5 overflow-hidden rounded-full">
                  {breakdown?.subjects.map((s) => (
                    <div
                      key={s.subjectId ?? 'none'}
                      style={{
                        width: `${s.percentage}%`,
                        background: s.color ?? 'var(--f-muted)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  {breakdown?.subjects.map((s) => (
                    <div
                      key={s.subjectId ?? 'none'}
                      className="flex items-center gap-2 text-[12px]"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: s.color ?? 'var(--f-muted)' }}
                      />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="tabular-nums text-muted">{s.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {reportsLayout === 'narrative' && !summary && !blocked && !loading && heatmapCard}

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
