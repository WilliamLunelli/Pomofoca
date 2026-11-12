import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import type { RoutineBlock } from '@pomofoca/shared';

export interface RoutineBlockInput {
  subjectId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label?: string | null;
}

export function useRoutine() {
  const [blocks, setBlocks] = useState<RoutineBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<RoutineBlock[]>('/routine');
      setBlocks(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível carregar a rotina.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createBlock(input: RoutineBlockInput) {
    const block = await api.post<RoutineBlock>('/routine', input);
    setBlocks((prev) => [...prev, block]);
    return block;
  }

  async function updateBlock(
    id: string,
    input: Partial<RoutineBlockInput & { active: boolean }>,
  ) {
    const block = await api.patch<RoutineBlock>(`/routine/${id}`, input);
    setBlocks((prev) => prev.map((b) => (b.id === id ? block : b)));
    return block;
  }

  async function deleteBlock(id: string) {
    await api.delete(`/routine/${id}`);
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  return { blocks, loading, error, reload, createBlock, updateBlock, deleteBlock };
}
