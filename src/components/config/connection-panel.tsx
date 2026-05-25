'use client';

import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Server, Terminal } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { TimeAgo } from '@/components/shared/time-ago';
import { C } from '@/lib/colors';

interface ServiceConfig {
  label: string;
  path: string;
  icon: LucideIcon;
  displayUrl: string;
}

const SERVICES: ServiceConfig[] = [
  { label: 'Playground', path: '/api/playground/health', icon: Terminal, displayUrl: 'http://localhost:8000' },
  { label: 'Control Plane', path: '/api/cp/health', icon: Server, displayUrl: 'http://localhost:4000' },
];

export function ConnectionPanel() {
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>
        Service connections
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SERVICES.map((s) => (
          <ServiceRow key={s.label} {...s} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 14 }}>
        URLs are read from the <span className="mono">PLAYGROUND_URL</span> and{' '}
        <span className="mono">CP_URL</span> env vars on the console server.
        API keys, if any, never reach the browser.
      </div>
    </Card>
  );
}

function ServiceRow({ label, path, icon: Icon, displayUrl }: ServiceConfig) {
  const { data, isError, dataUpdatedAt, isFetching } = useQuery({
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
    <div
      style={{
        padding: 14,
        background: C.bg3,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={15} color={C.teal} />
          <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: ok ? C.green : C.red,
            }}
          />
          <span style={{ color: ok ? C.green : C.red }}>
            {isFetching && !data ? 'checking…' : ok ? 'healthy' : 'unreachable'}
          </span>
        </div>
      </div>
      <input
        value={displayUrl}
        readOnly
        style={{
          width: '100%',
          background: C.bg2,
          border: `1px solid ${C.border}`,
          borderRadius: 5,
          padding: '7px 10px',
          color: C.textDim,
          fontSize: 12,
          fontFamily: 'JetBrains Mono',
        }}
      />
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>
        Last checked: {dataUpdatedAt ? <TimeAgo ts={dataUpdatedAt} /> : 'never'}
      </div>
    </div>
  );
}
