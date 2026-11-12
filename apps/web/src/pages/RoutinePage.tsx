import { Trash, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { useRoutine, type RoutineBlockInput } from '@/hooks/useRoutine';
import { useSubjects } from '@/hooks/useSubjects';
import { api, ApiError } from '@/lib/api';
import type { ReportBreakdown, RoutineBlock } from '@pomofoca/shared';

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAY_LABELS_FULL = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

const HOUR_START = 6;
const HOUR_END = 23; // conteudo do grid vai de 6:00 ate 24:00
const ROW_HEIGHT = 44;
const GRID_HEIGHT = (HOUR_END + 1 - HOUR_START) * ROW_HEIGHT;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function blockTop(startTime: string): number {
  return ((timeToMinutes(startTime) - HOUR_START * 60) / 60) * ROW_HEIGHT;
}

function blockHeight(startTime: string, endTime: string): number {
  return ((timeToMinutes(endTime) - timeToMinutes(startTime)) / 60) * ROW_HEIGHT;
}

// "08:00" -> "8h", "08:30" -> "8h30"
function formatShortTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

interface BlockFormState {
  id: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  label: string;
  active: boolean;
}

export function RoutinePage() {
  const { blocks, loading, error, createBlock, updateBlock, deleteBlock } = useRoutine();
  const { subjects } = useSubjects();
  const [form, setForm] = useState<BlockFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [studiedSubjectIdsToday, setStudiedSubjectIdsToday] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    api
      .get<ReportBreakdown>('/reports/breakdown?period=today')
      .then((data) => {
        setStudiedSubjectIdsToday(
          new Set(
            data.subjects.filter((s) => s.minutes > 0).map((s) => s.subjectId ?? ''),
          ),
        );
      })
      .catch(() => {});
  }, []);

  const todayWeekday = new Date().getDay();
  const todayBlocks = useMemo(
    () =>
      blocks
        .filter((b) => b.dayOfWeek === todayWeekday && b.active)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [blocks, todayWeekday],
  );

  function subjectFor(id: string | null) {
    return id ? subjects.find((s) => s.id === id) : undefined;
  }

  function openCreateForm(dayOfWeek: number, hour: number) {
    setFormError(null);
    setForm({
      id: null,
      dayOfWeek,
      startTime: `${String(hour).padStart(2, '0')}:00`,
      endTime: `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`,
      subjectId: '',
      label: '',
      active: true,
    });
  }

  function openEditForm(block: RoutineBlock) {
    setFormError(null);
    setForm({
      id: block.id,
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      subjectId: block.subjectId ?? '',
      label: block.label ?? '',
      active: block.active,
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const input: RoutineBlockInput = {
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        subjectId: form.subjectId || null,
        label: form.label.trim() || null,
      };
      if (form.id) {
        await updateBlock(form.id, { ...input, active: form.active });
      } else {
        await createBlock(input);
      }
      setForm(null);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Não foi possível salvar o bloco.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!form?.id) return;
    setSubmitting(true);
    try {
      await deleteBlock(form.id);
      setForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível excluir.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h3 className="text-xl">Rotina semanal</h3>
        <p className="text-sm text-muted">
          Um horário fixo recorrente. Toque num espaço vazio pra criar, num bloco
          existente pra editar.
        </p>
      </div>

      {todayBlocks.length > 0 && (
        <div className="card mb-6 p-6">
          <h6 className="mb-4">Hoje</h6>
          <div className="flex flex-col gap-2">
            {todayBlocks.map((block) => {
              const subject = subjectFor(block.subjectId);
              const fulfilled = block.subjectId
                ? studiedSubjectIdsToday.has(block.subjectId)
                : false;
              return (
                <div key={block.id} className="flex items-center gap-3 text-[13px]">
                  <span
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: fulfilled ? 'var(--f-ok)' : 'var(--f-track)' }}
                  />
                  <span className="tabular-nums text-muted">
                    {formatShortTime(block.startTime)} às {formatShortTime(block.endTime)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {subject && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: subject.color }}
                      />
                    )}
                    {block.label || subject?.name || 'Estudo'}
                  </span>
                  {fulfilled && <span className="text-[11px] text-ok">cumprido</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-muted">Carregando…</p>}
      {error && <p className="text-sm text-cta">{error}</p>}

      {!loading && (
        <div className="card overflow-x-auto p-4">
          <div className="grid min-w-[720px] grid-cols-[44px_repeat(7,1fr)]">
            <div />
            {DAY_LABELS.map((label, day) => (
              <div
                key={label}
                className="pb-2 text-center text-[11px] font-heading"
                style={{
                  color: day === todayWeekday ? 'var(--color-accent)' : undefined,
                }}
              >
                {label}
              </div>
            ))}

            <div className="relative" style={{ height: GRID_HEIGHT }}>
              {Array.from(
                { length: HOUR_END + 1 - HOUR_START },
                (_, i) => HOUR_START + i,
              ).map((hour) => (
                <div
                  key={hour}
                  className="absolute right-1 text-[10px] text-muted"
                  style={{ top: (hour - HOUR_START) * ROW_HEIGHT - 6 }}
                >
                  {hour}h
                </div>
              ))}
            </div>

            {DAY_LABELS.map((_, day) => (
              <div
                key={day}
                className="relative border-l border-divider"
                style={{ height: GRID_HEIGHT }}
              >
                {Array.from(
                  { length: HOUR_END + 1 - HOUR_START },
                  (_, i) => HOUR_START + i,
                ).map((hour) => (
                  <button
                    key={hour}
                    className="absolute w-full border-t border-divider transition-colors hover:bg-tint"
                    style={{ top: (hour - HOUR_START) * ROW_HEIGHT, height: ROW_HEIGHT }}
                    onClick={() => openCreateForm(day, hour)}
                  />
                ))}

                {blocks
                  .filter((b) => b.dayOfWeek === day)
                  .map((block) => {
                    const subject = subjectFor(block.subjectId);
                    const color = subject?.color ?? 'var(--color-accent)';
                    return (
                      <button
                        key={block.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditForm(block);
                        }}
                        className="absolute left-0.5 right-0.5 overflow-hidden rounded-sm px-1.5 py-1 text-left text-[10px] leading-tight transition-opacity"
                        style={{
                          top: blockTop(block.startTime),
                          height: Math.max(
                            blockHeight(block.startTime, block.endTime),
                            18,
                          ),
                          background: `${color}22`,
                          borderLeft: `2px solid ${color}`,
                          opacity: block.active ? 1 : 0.4,
                        }}
                      >
                        <div
                          className="truncate font-medium"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {block.label || subject?.name || 'Estudo'}
                        </div>
                        {blockHeight(block.startTime, block.endTime) >= 34 && (
                          <div
                            className="truncate tabular-nums"
                            style={{ color: 'var(--f-muted)' }}
                          >
                            {formatShortTime(block.startTime)} às{' '}
                            {formatShortTime(block.endTime)}
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
          <form
            onSubmit={handleSubmit}
            className="card w-full max-w-sm p-6"
            style={{ animation: 'fk-rise 200ms ease' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h6 className="m-0">
                {form.id ? 'Editar bloco' : 'Novo bloco'} ·{' '}
                {DAY_LABELS_FULL[form.dayOfWeek]}
              </h6>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setForm(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex gap-3">
                <div className="field flex-1">
                  <label htmlFor="start-time">Início</label>
                  <input
                    id="start-time"
                    type="time"
                    className="input"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    required
                  />
                </div>
                <div className="field flex-1">
                  <label htmlFor="end-time">Fim</label>
                  <input
                    id="end-time"
                    type="time"
                    className="input"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="block-subject">Matéria</label>
                <select
                  id="block-subject"
                  className="input"
                  value={form.subjectId}
                  onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                >
                  <option value="">Nenhuma (bloco genérico)</option>
                  {subjects
                    .filter((s) => !s.archived)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="block-label">Rótulo (opcional)</label>
                <input
                  id="block-label"
                  className="input"
                  placeholder="ex: Revisão antes da prova"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>

              {form.id && (
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Ativo
                </label>
              )}

              {formError && <p className="text-sm text-cta">{formError}</p>}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={submitting}
                >
                  {submitting ? 'Salvando…' : 'Salvar'}
                </button>
                {form.id && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="Excluir bloco"
                    onClick={handleDelete}
                    disabled={submitting}
                  >
                    <Trash size={16} />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
