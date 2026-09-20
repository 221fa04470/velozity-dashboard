import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** The open task drawer is part of the URL (?task=12) so a task can be linked to directly. */
export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  const id = Number(params.get('task')) || null;
  const open = useCallback(
    (taskId: number) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('task', String(taskId));
        return next;
      }),
    [setParams],
  );
  const close = useCallback(
    () =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('task');
        return next;
      }),
    [setParams],
  );
  return { id, open, close };
}
