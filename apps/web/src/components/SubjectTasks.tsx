import { CaretDown, CaretUp, Check, Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { useSubjectTasks } from '@/hooks/useSubjectTasks';
import { ApiError } from '@/lib/api';

interface SubjectTasksProps {
  subjectId: string;
}

export function SubjectTasks({ subjectId }: SubjectTasksProps) {
  const { tasks, loading, error, createTask, toggleTask, deleteTask } =
    useSubjectTasks(subjectId);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [poppedId, setPoppedId] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await createTask(title.trim());
      setTitle('');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Não foi possível criar a tarefa.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-t border-divider px-6 py-4">
      {loading && <p className="text-xs text-muted">Carregando tarefas…</p>}
      {error && <p className="text-xs text-cta">{error}</p>}

      {!loading && tasks.length === 0 && (
        <p className="text-xs text-muted">Nenhuma tarefa ainda.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2.5 py-1">
            <button
              role="checkbox"
              aria-checked={task.completed}
              onClick={() => {
                // pop só na transição não concluída → concluída feita pelo usuário
                setPoppedId(task.completed ? null : task.id);
                toggleTask(task.id, !task.completed);
              }}
              data-done={task.completed}
              data-pop={poppedId === task.id && task.completed}
              onAnimationEnd={() => setPoppedId(null)}
              className="task-check flex h-[18px] w-[18px] flex-none items-center justify-center rounded-sm border"
              style={{
                borderColor: task.completed
                  ? 'var(--color-accent)'
                  : 'var(--color-divider)',
                background: task.completed ? 'var(--color-accent)' : 'transparent',
              }}
            >
              {task.completed && <Check size={11} weight="bold" className="text-bg" />}
            </button>
            <span
              data-done={task.completed}
              className="task-title flex-1 text-[13px]"
              style={{
                color: task.completed ? 'var(--f-muted)' : 'var(--color-text)',
              }}
            >
              {task.title}
            </span>
            <button
              className="btn btn-ghost btn-icon"
              title="Excluir tarefa"
              onClick={() => deleteTask(task.id)}
            >
              <Trash size={13} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          className="input"
          placeholder="Nova tarefa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-secondary btn-icon flex-none"
          disabled={submitting || !title.trim()}
          title="Adicionar tarefa"
        >
          <Plus size={15} />
        </button>
      </form>
      {formError && <p className="mt-1.5 text-xs text-cta">{formError}</p>}
    </div>
  );
}

interface SubjectTasksToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

export function SubjectTasksToggle({ expanded, onToggle }: SubjectTasksToggleProps) {
  return (
    <button
      className="btn btn-ghost flex items-center gap-1.5 text-[12px]"
      title={expanded ? 'Ocultar tarefas' : 'Ver tarefas'}
      onClick={onToggle}
    >
      Tarefas
      {expanded ? <CaretUp size={13} /> : <CaretDown size={13} />}
    </button>
  );
}
