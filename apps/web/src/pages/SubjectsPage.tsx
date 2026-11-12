import { Archive, ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { SubjectTasks, SubjectTasksToggle } from '@/components/SubjectTasks';
import { useAuth } from '@/context/AuthContext';
import { useSubjects } from '@/hooks/useSubjects';
import { api, ApiError } from '@/lib/api';
import { getReadableTextColor, SUBJECT_COLOR_PRESETS } from '@/lib/color';
import type { ReportBreakdown, Subject } from '@pomofoca/shared';

function formatHM(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function WeeklyProgress({
  color,
  studied,
  goal,
}: {
  color: string;
  studied: number;
  goal: number;
}) {
  const pct = Math.min((studied / goal) * 100, 100);
  const done = studied >= goal;
  return (
    <div className="mt-1">
      <div className="mb-1 flex items-center gap-1 text-xs text-muted">
        <span className="truncate">
          {formatHM(studied)} de {formatHM(goal)} esta semana
        </span>
        {done && (
          <Check size={12} weight="bold" className="flex-none" style={{ color: 'var(--f-ok)' }} />
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-track">
        <div
          className="bar-grow h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function SubjectsPage() {
  const { user } = useAuth();
  const { subjects, loading, error, reload } = useSubjects(true);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLOR_PRESETS[0]);
  const [goal, setGoal] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedTasksFor, setExpandedTasksFor] = useState<string | null>(null);

  const [weekMinutes, setWeekMinutes] = useState<Record<string, number>>({});

  // Uma unica chamada pra pagina toda (nao uma por card). Falha silenciosa: o
  // progresso e um extra, os cards continuam mostrando so a meta.
  const loadWeek = useCallback(async () => {
    try {
      const data = await api.get<ReportBreakdown>('/reports/breakdown?period=week');
      const map: Record<string, number> = {};
      for (const b of data.subjects) if (b.subjectId) map[b.subjectId] = b.minutes;
      setWeekMinutes(map);
    } catch {
      // sem progresso
    }
  }, []);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const active = subjects.filter((s) => !s.archived);
  const archived = subjects.filter((s) => s.archived);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post<Subject>('/subjects', {
        name,
        color,
        weeklyGoalMinutes: goal ? Number(goal) * 60 : undefined,
      });
      setName('');
      setGoal('');
      setFormOpen(false);
      await reload();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Não foi possível criar a matéria.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function archive(id: string) {
    await api.delete(`/subjects/${id}`);
    reload();
  }

  async function restore(id: string) {
    await api.patch(`/subjects/${id}/restore`);
    reload();
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h3 className="text-xl">Matérias</h3>
          <div className="text-sm text-muted">
            {active.length} {active.length === 1 ? 'ativa' : 'ativas'} ·{' '}
            {user?.plan === 'PREMIUM'
              ? 'plano Premium, sem limite'
              : 'plano gratuito, até 3'}
          </div>
        </div>
        <button
          className="btn btn-primary flex-none"
          onClick={() => setFormOpen((o) => !o)}
        >
          {formOpen ? 'Cancelar' : 'Nova matéria'}
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          // Formulario fica com largura de leitura confortavel mesmo num monitor
          // grande - diferente da listagem abaixo, um form nao deve "esticar" pra
          // preencher o espaco, so fica com campos espalhados sem motivo.
          className="card mb-6 flex max-w-[720px] flex-wrap items-end gap-6 p-8"
          style={{ animation: 'fk-rise 200ms ease' }}
        >
          <div className="field min-w-[200px] flex-1">
            <label htmlFor="subject-name">Nome</label>
            <input
              id="subject-name"
              className="input"
              placeholder="ex: Cálculo I"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Cor</label>
            <div className="flex gap-1.5">
              {SUBJECT_COLOR_PRESETS.map((hex) => {
                const selected = color === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    title={hex}
                    aria-label={hex}
                    aria-pressed={selected}
                    onClick={() => setColor(hex)}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full transition-transform"
                    style={{
                      background: hex,
                      transform: selected ? 'scale(1.12)' : 'scale(1)',
                      boxShadow: selected
                        ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-text)'
                        : 'none',
                    }}
                  >
                    {selected && (
                      <Check size={13} weight="bold" color={getReadableTextColor(hex)} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field w-[120px]">
            <label htmlFor="subject-goal">Meta semanal (h)</label>
            <input
              id="subject-goal"
              className="input"
              type="number"
              min={0}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar'}
          </button>
          {formError && <p className="w-full text-sm text-cta">{formError}</p>}
        </form>
      )}

      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {error && <p className="text-sm text-cta">{error}</p>}

      {!loading && !error && active.length === 0 && !formOpen && (
        <div className="card mx-auto flex max-w-[480px] flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-text">Nenhuma matéria ainda.</p>
          <p className="max-w-[38ch] text-xs text-muted">
            Crie uma matéria pra começar a separar seu tempo de estudo por assunto. É o
            que alimenta o relatório.
          </p>
          <button className="btn btn-primary mt-2" onClick={() => setFormOpen(true)}>
            Nova matéria
          </button>
        </div>
      )}

      {/* auto-fill/minmax em vez de coluna unica - o numero de cards por linha se
          ajusta sozinho ao espaco disponivel (1 no mobile, varios num 4K), sem
          breakpoints manuais. items-start evita que um card com tarefas expandidas
          estique visualmente os vizinhos mais curtos na mesma linha (a linha ainda
          reserva a altura do mais alto - isso e comportamento normal de grid - mas
          cada card fica no topo da propria celula em vez de esticar o fundo). */}
      <div
        className="stagger grid items-start gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
      >
        {active.map((s) => {
          const tasksExpanded = expandedTasksFor === s.id;
          return (
            <div key={s.id} className="card overflow-hidden">
              <div className="flex items-center gap-4 p-5">
                <div
                  className="h-[38px] w-[38px] flex-none rounded-sm"
                  style={{ background: `${s.color}22` }}
                >
                  <div className="flex h-full w-full items-center justify-center">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: s.color }}
                    />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[15px]">{s.name}</div>
                  {s.weeklyGoalMinutes ? (
                    <WeeklyProgress
                      color={s.color}
                      studied={weekMinutes[s.id] ?? 0}
                      goal={s.weeklyGoalMinutes}
                    />
                  ) : null}
                </div>
                <div className="flex flex-none items-center gap-1">
                  <SubjectTasksToggle
                    expanded={tasksExpanded}
                    onToggle={() => setExpandedTasksFor(tasksExpanded ? null : s.id)}
                  />
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Arquivar"
                    onClick={() => archive(s.id)}
                  >
                    <Archive size={16} />
                  </button>
                </div>
              </div>
              {tasksExpanded && <SubjectTasks subjectId={s.id} />}
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <h6 className="mb-4">Arquivadas</h6>
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {archived.map((s) => (
              <div key={s.id} className="card flex items-center gap-4 p-4 opacity-60">
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: s.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                <button
                  className="btn btn-ghost btn-icon"
                  title="Restaurar"
                  onClick={() => restore(s.id)}
                >
                  <ArrowCounterClockwise size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {user?.plan === 'FREE' && (
        <p className="mt-6 text-xs text-muted">
          No plano gratuito você mantém 3 matérias ativas. Arquivar preserva todo o
          histórico.
        </p>
      )}
    </div>
  );
}
