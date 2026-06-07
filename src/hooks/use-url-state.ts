'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Sync a single string-valued search-param to state. Empty / default
 *  values are stripped from the URL so the bar stays clean.
 *
 *  Uses `router.replace`, not `push`, so filter edits don't pollute the
 *  back-stack — back/forward still moves between distinct pages.
 *
 *  Reads via Next's `useSearchParams`, which is reactive: opening a deep
 *  link or hitting back/forward updates every consumer of the same key. */
export function useUrlState(
  key: string,
  defaultValue = '',
): [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const sp = new URLSearchParams(params.toString());
      if (next === defaultValue || next === '') sp.delete(key);
      else sp.set(key, next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, defaultValue, params, pathname, router],
  );

  return [value, setValue];
}

/** Same idea, narrowed to a union of allowed string values. Anything
 *  outside the union (including an empty param) falls back to `fallback`. */
export function useUrlEnum<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [raw, setRaw] = useUrlState(key, fallback);
  const allowed = useMemo(() => new Set<string>(values), [values]);
  const value = (allowed.has(raw) ? raw : fallback) as T;
  const setValue = useCallback((next: T) => setRaw(next), [setRaw]);
  return [value, setValue];
}

/** Same idea, for an integer. NaN / out-of-range values fall back. */
export function useUrlInt(
  key: string,
  fallback: number,
  allowed?: readonly number[],
): [number, (next: number) => void] {
  const [raw, setRaw] = useUrlState(key, String(fallback));
  const parsed = Number(raw);
  const ok = Number.isFinite(parsed) && (!allowed || allowed.includes(parsed));
  const value = ok ? parsed : fallback;
  const setValue = useCallback((next: number) => setRaw(String(next)), [setRaw]);
  return [value, setValue];
}
