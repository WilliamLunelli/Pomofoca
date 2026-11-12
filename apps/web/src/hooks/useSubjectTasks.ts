import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import type { Task } from '@pomofoca/shared';

export function useSubjectTasks(subjectId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!subjectId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Task[]>(`/subjects/${subjectId}/tasks`);
      setTasks(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível carregar tarefas.',
      );
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createTask(title: string) {
    if (!subjectId) return;
    const task = await api.post<Task>(`/subjects/${subjectId}/tasks`, { title });
    setTasks((prev) => [...prev, task]);
  }

  async function toggleTask(id: string, completed: boolean) {
    const task = await api.patch<Task>(`/tasks/${id}`, { completed });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
  }

  async function deleteTask(id: string) {
    await api.delete(`/tasks/${id}`);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return { tasks, loading, error, reload, createTask, toggleTask, deleteTask };
}
