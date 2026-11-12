import { Books, CalendarBlank, CalendarX, Clock, Flame, Lock, Warning } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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

import { CountUp } from '@/components/CountUp';
import { DemoHeatmap } from '@/components/landing/DemoHeatmap';
import { Foki } from '@/components/Foki';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { api, ApiError } from '@/lib/api';
import type {
  InsightItem,
  InsightsResponse,
  ReportBreakdown,
  ReportHeatmap,
  ReportStreak,
  ReportSummary,
  ReportTrend,
} from '@pomofoca/shared';

const INSIGHT_ICON: Record<InsightItem['type'], typeof Clock> = {
  peak_hours: Clock,
  weak_day: CalendarX,
  neglected_subject: Books,
  interruption_pattern: Warning,
  routine_mismatch: CalendarBlank,
};

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
  'color-mix(in srgb, var(--color-accent) 25%, transparent)',
  'color-mix(in srgb, var(--color-accent) 45%, transparent)',
  'color-mix(in srgb, var(--color-accent) 70%, transparent)',
  'var(--color-accent)',
];

// Barra de hoje (ponto cuja data e hoje no fuso local) em accent cheio; as demais mais suaves.
const BAR_TODAY = 'var(--color-accent)';
const BAR_SOFT = 'color-mix(in srgb, var(--color-accent) 55%, transparent)';

// Selo sobre uma previa desfocada e ficticia de um recurso Premium bloqueado.
function LockedPreview({ children, text }: { children: ReactNode; text: string }) {
  return (
    <div className="relative overflow-hidden rounded-md">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{ filter: 'blur(5px)', opacity: 0.45 }}
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="card flex max-w-full flex-wrap items-center justify-center gap-3 px-4 py-3 text-center">
          <Lock size={16} className="flex-none text-accent" />
          <span className="text-[13px]">{text}</span>
          <Link to="/subscription" className="btn btn-primary">
            Desbloquear com Premium
          </Link>
        </div>
      </div>
    </div>
  );
}

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
  const reducedMotion = useReducedMotion();
  const [period, setPeriod] = useState<Period>('week');

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [breakdown, setBreakdown] = useState<ReportBreakdown | null>(null);
  const [trend, setTrend] = useState<ReportTrend | null>(null);
  const [streak, setStreak] = useState<ReportStreak | null>(null);
  const [heatmap, setHeatmap] = useState<ReportHeatmap | null>(null);
  const [heatmapLocked, setHeatmapLocked] = useState(false);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsLocked, setInsightsLocked] = useState(false);
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

  useEffect(() => {
    api
      .get<InsightsResponse>('/insights')
      .then(setInsights)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'PREMIUM_FEATURE_REQUIRED') {
          setInsightsLocked(true);
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

  const trendData = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return (trend?.points ?? []).map((p) => ({
      label: p.from.slice(5),
      minutes: p.minutes,
      isToday: p.from.slice(0, 10) === todayLocal,
    }));
  }, [trend]);

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
        <LockedPreview text="Heatmap anual é exclusivo do Premium">
          <DemoHeatmap weeks={26} />
        </LockedPreview>
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
      <Flame
        weight="fill"
        size={28}
        className={`text-cta${streak.currentStreak > 0 ? ' flame-flicker' : ''}`}
      />
      <div>
        <div className="font-heading text-xl tabular-nums">
          <CountUp value={streak.currentStreak} /> dias
        </div>
        <div className="text-xs text-muted">
          sequência atual · recorde {streak.recordStreak}
          {streak.scope === 'week' && ' (últimos 7 dias, plano gratuito)'}
        </div>
      </div>
    </div>
  );

  const insightsCard = (
    <div className="card p-8">
      <div className="mb-6 flex items-center justify-between">
        <h6 className="m-0">Insights</h6>
        {insightsLocked && (
          <Link
            to="/subscription"
            className="flex items-center gap-1.5 text-xs text-accent"
          >
            <Lock size={13} /> recurso Premium
          </Link>
        )}
      </div>
      {insightsLocked ? (
        <LockedPreview text="Insights adaptativos são exclusivos do Premium">
          <div className="flex min-h-[160px] flex-col justify-center gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="mt-0.5 h-[18px] w-[18px] flex-none rounded-full bg-track" />
                <div className="flex-1">
                  <div className="mb-2 h-3 w-1/3 rounded-full bg-track" />
                  <div className="h-3 w-4/5 rounded-full bg-track" />
                </div>
              </div>
            ))}
          </div>
        </LockedPreview>
      ) : !insights ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : !insights.hasEnoughData ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            Continue estudando: seus insights aparecem depois que houver dado suficiente
            pra serem confiáveis.
          </p>
          <p className="text-xs text-muted">
            {insights.missingDays > 0 &&
              `${insights.missingDays} dia${insights.missingDays === 1 ? '' : 's'} de histórico`}
            {insights.missingDays > 0 && insights.missingSessions > 0 && ' e '}
            {insights.missingSessions > 0 &&
              `${insights.missingSessions} ${insights.missingSessions === 1 ? 'sessão completa' : 'sessões completas'}`}{' '}
            pra desbloquear.
          </p>
        </div>
      ) : insights.insights.length === 0 ? (
        <p className="text-sm text-muted">
          Nada de específico pra destacar ainda. Seu padrão de estudo está equilibrado,
          ou ainda não há dado suficiente pra um insight específico.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {insights.insights.map((insight) => {
            const Icon = INSIGHT_ICON[insight.type];
            return (
              <div key={insight.type} className="flex gap-3">
                <Icon size={18} className="mt-0.5 flex-none text-accent" />
                <div>
                  <div className="text-[13px] font-heading">{insight.title}</div>
                  <p className="text-[13px] text-muted">{insight.description}</p>
                  <p className="text-[11px] text-muted">
                    baseado em {insight.dataPoints}{' '}
                    {insight.dataPoints === 1 ? 'sessão' : 'sessões'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
                className="seg-btn rounded-sm border px-2.5 py-1.5 text-xs"
                style={toggleStyle(period === p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setReportsLayout('narrative')}
              className="seg-btn rounded-sm border px-2.5 py-1.5 text-[11px]"
              style={toggleStyle(reportsLayout === 'narrative')}
            >
              Narrativa
            </button>
            <button
              onClick={() => setReportsLayout('dense')}
              className="seg-btn rounded-sm border px-2.5 py-1.5 text-[11px]"
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
          <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="card p-6">
              <h6 className="mb-3">Minutos estudados</h6>
              <div className="font-heading text-2xl tabular-nums">
                <CountUp value={summary.studyMinutes} format={formatMinutes} />
              </div>
            </div>
            <div className="card p-6">
              <h6 className="mb-3">Sessões completas</h6>
              <div className="font-heading text-2xl tabular-nums">
                <CountUp value={summary.sessionsCompleted} />
              </div>
            </div>
            <div className="card p-6">
              <h6 className="mb-3">Taxa de conclusão</h6>
              <div className="font-heading text-2xl tabular-nums">
                <CountUp value={Math.round(summary.completionRate * 100)} />%
              </div>
            </div>
            <div className="card p-6">
              <h6 className="mb-3">Dias ativos</h6>
              <div className="font-heading text-2xl tabular-nums">
                <CountUp value={summary.activeDays} />
              </div>
            </div>
          </div>

          <div className="stagger grid gap-6 lg:grid-cols-2">
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
                        isAnimationActive={!reducedMotion}
                        animationDuration={700}
                        animationEasing="ease-out"
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
                    fill={BAR_SOFT}
                    radius={[3, 3, 0, 0]}
                    // sem animacao propria: a de entrada do Recharts congela posicoes
                    // medidas durante a entrada da pagina e desalinha barras e rotulos
                    isAnimationActive={false}
                  >
                    {trendData.map((p) => (
                      <Cell
                        key={p.label}
                        fill={p.isToday ? BAR_TODAY : BAR_SOFT}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {streakCard}
          {heatmapCard}
          {insightsCard}
        </div>
      )}

      {!blocked && summary && reportsLayout === 'dense' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="stagger flex flex-col gap-6">
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
                    fill={BAR_SOFT}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  >
                    {trendData.map((p) => (
                      <Cell
                        key={p.label}
                        fill={p.isToday ? BAR_TODAY : BAR_SOFT}
                      />
                    ))}
                  </Bar>
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

            {insightsCard}
          </div>

          <div className="stagger flex flex-col gap-4">
            {streakCard}

            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Minutos</h6>
              <div className="font-heading text-xl tabular-nums">
                <CountUp value={summary.studyMinutes} format={formatMinutes} />
              </div>
            </div>
            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Sessões</h6>
              <div className="font-heading text-xl tabular-nums">
                <CountUp value={summary.sessionsCompleted} />
              </div>
            </div>
            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Conclusão</h6>
              <div className="font-heading text-xl tabular-nums">
                <CountUp value={Math.round(summary.completionRate * 100)} />%
              </div>
            </div>
            <div className="card flex items-center justify-between gap-4 p-4">
              <h6 className="m-0">Dias ativos</h6>
              <div className="font-heading text-xl tabular-nums">
                <CountUp value={summary.activeDays} />
              </div>
            </div>

            {donutData.length > 0 && (
              <div className="card p-4">
                <h6 className="mb-3">Distribuição</h6>
                <div className="mb-3 flex h-2.5 overflow-hidden rounded-full">
                  {breakdown?.subjects.map((s) => (
                    <div
                      key={s.subjectId ?? 'none'}
                      className="bar-grow"
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
