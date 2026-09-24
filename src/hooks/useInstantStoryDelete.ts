/**
 * Instant story delete: removes from local list immediately, then hits the API.
 */
import { useCallback, useEffect, useState } from 'react';
import { deleteStoryInstant } from '@/lib/postStoryPatch';

export function useInstantStoryDelete<T extends { id: string | number }>(initial: T[] = []) {
  const [items, setItems] = useState<T[]>(initial);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    const onDel = (e: Event) => {
      const id = String((e as CustomEvent).detail?.id ?? '');
      if (!id) return;
      setItems((prev) => prev.filter((x) => String(x.id) !== id));
    };
    window.addEventListener('stooorna:story-deleted', onDel as EventListener);
    return () => window.removeEventListener('stooorna:story-deleted', onDel as EventListener);
  }, []);

  const remove = useCallback(async (id: string | number) => {
    const sid = String(id);
    setItems((prev) => prev.filter((x) => String(x.id) !== sid));
    return deleteStoryInstant(sid);
  }, []);

  return { items, setItems, remove };
}

export default useInstantStoryDelete;
