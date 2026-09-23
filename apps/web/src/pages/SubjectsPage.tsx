import { Archive, ArrowCounterClockwise } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useSubjects } from '@/hooks/useSubjects';
import { api, ApiError } from '@/lib/api';
import { SUBJECT_COLOR_PRESETS } from '@/lib/color';
import type { Subject } from '@/lib/types';

export function SubjectsPage() {
  const { user } = useAuth();
  const { subjects, loading, error, reload } = useSubjects(true);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLOR_PRESETS[0]);
  const [goal, setGoal] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="max-w-[780px] p-6 md:p-8">
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
          className="card mb-6 flex flex-wrap items-end gap-6 p-8"
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
              {SUBJECT_COLOR_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => setColor(hex)}
                  className="h-[26px] w-[26px] rounded-full border-2"
                  style={{
                    background: hex,
                    borderColor: color === hex ? hex : 'transparent',
                  }}
                />
              ))}
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

      <div className="flex flex-col gap-4">
        {active.map((s) => (
          <div key={s.id} className="card flex items-center gap-6 p-6">
            <div
              className="h-[38px] w-[38px] flex-none rounded-sm"
              style={{ background: `${s.color}22` }}
            >
              <div className="flex h-full w-full items-center justify-center">
                <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-heading text-[15px]">{s.name}</div>
              {s.weeklyGoalMinutes && (
                <div className="text-xs text-muted">
                  meta: {Math.round(s.weeklyGoalMinutes / 60)}h/semana
                </div>
              )}
            </div>
            <div className="flex flex-none gap-1">
              <button
                className="btn btn-ghost btn-icon"
                title="Arquivar"
                onClick={() => archive(s.id)}
              >
                <Archive size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <h6 className="mb-4">Arquivadas</h6>
          <div className="flex flex-col gap-3">
            {archived.map((s) => (
              <div key={s.id} className="card flex items-center gap-4 p-4 opacity-60">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="flex-1 text-sm">{s.name}</span>
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
