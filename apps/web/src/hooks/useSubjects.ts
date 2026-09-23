import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import type { Subject } from '@/lib/types';

export function useSubjects(includeArchived = false) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = includeArchived ? '?archived=true' : '';
      const data = await api.get<Subject[]>(`/subjects${query}`);
      setSubjects(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível carregar matérias.',
      );
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { subjects, loading, error, reload };
}
