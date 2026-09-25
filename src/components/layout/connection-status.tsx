'use client';

import { useQuery } from '@tanstack/react-query';
import { useHydrated } from '@/hooks/use-hydrated';
import { C } from '@/lib/colors';
import { REFETCH } from '@/lib/query-options';

interface Props {
  label: string;
  path: string;
  /** Predicate to interpret the upstream payload. Default: HTTP 2xx is healthy. */
  isHealthy?: (status: number, body: unknown) => boolean;
  onClick?: () => void;
}

export function ConnectionStatus({ label, path, isHealthy, onClick }: Props) {
  // This renders in the top bar on every page, so it mounts (and its query
  // starts fetching) immediately on every navigation. Same hydration race
  // as ConnectionPanel: `data`/`isError` can resolve before hydration
  // finishes, so `ok` (and the title/dot-color/pulse it drives) can already
  // disagree with the server-rendered "unreachable" default on the client's
  // first render. Gate on `hydrated` so that first render always matches --
  // see use-hydrated.ts.
  const hydrated = useHydrated();

  const { data, isError } = useQuery({
    queryKey: ['health', path],
    queryFn: async () => {
      const res = await fetch(path, { cache: 'no-store' });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {}
      return { ok: res.ok, status: res.status, body };
    },
    refetchInterval: REFETCH.health,
    retry: false,
  });

  let ok = false;
  if (hydrated && !isError && data) {
    if (isHealthy) {
      try {
        ok = isHealthy(data.status, data.body);
      } catch {
        // A buggy predicate shouldn't poison the indicator.
        ok = false;
      }
    } else {
      ok = data.ok;
    }
  }

  return (
    <button
      onClick={onClick}
      title={`${label}: ${ok ? 'healthy' : 'unreachable'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '4px 10px',
        cursor: 'pointer',
      }}
    >
      <span
        className={ok ? 'pulse' : ''}
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: ok ? C.green : C.red,
        }}
      />
      <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
    </button>
  );
}
