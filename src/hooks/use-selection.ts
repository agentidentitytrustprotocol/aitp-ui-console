'use client';

import { useCallback, useMemo, useState } from 'react';

/** Row-selection helper for tables. Keeps the selected set, lets you
 *  toggle individual rows or toggle-all against the current visible row
 *  list, and clear once a bulk action completes.
 *
 *  Selection is intentionally NOT URL-synced. Bulk selection should not
 *  survive a reload (stale ids would silently no-op against the upstream). */
export function useSelection<T extends string>() {
  const [selected, setSelected] = useState<Set<T>>(new Set());

  const toggle = useCallback((id: T) => {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: T[]) => {
    setSelected((curr) => {
      const allSelected = ids.length > 0 && ids.every((id) => curr.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({
      selected,
      size: selected.size,
      has: (id: T) => selected.has(id),
      toggle,
      toggleAll,
      clear,
      ids: Array.from(selected),
    }),
    [selected, toggle, toggleAll, clear],
  );
}
