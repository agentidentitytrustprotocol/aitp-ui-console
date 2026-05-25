'use client';

import { useQuery } from '@tanstack/react-query';
import { C } from '@/lib/colors';

interface Props {
  label: string;
  path: string;
  onClick?: () => void;
}

export function ConnectionStatus({ label, path, onClick }: Props) {
  const { data, isError } = useQuery({
    queryKey: ['health', path],
    queryFn: async () => {
      const res = await fetch(path, { cache: 'no-store' });
      return { ok: res.ok, status: res.status };
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const ok = !isError && data?.ok === true;

  return (
    <button
      onClick={onClick}
      title={`${label} health: ${ok ? 'healthy' : 'unreachable'}`}
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
