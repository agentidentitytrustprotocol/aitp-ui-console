'use client';

import { usePathname, useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { C } from '@/lib/colors';
import { ConnectionStatus } from './connection-status';

function pathLabel(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  return (
    <header
      style={{
        height: 52,
        borderBottom: `1px solid ${C.border}`,
        background: C.bg1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 13, color: C.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono" style={{ color: C.textMuted }}>aitp /</span>
        <span style={{ color: C.text }}>{pathLabel(pathname)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <ConnectionStatus label="Playground" path="/api/playground/health" onClick={() => router.push('/config')} />
        <ConnectionStatus label="Control Plane" path="/api/cp/health" onClick={() => router.push('/config')} />
        <div style={{ width: 1, height: 20, background: C.border }} />
        <button
          onClick={() => qc.invalidateQueries()}
          title="Refresh"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.textDim,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  );
}
