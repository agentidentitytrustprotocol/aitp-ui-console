'use client';

import { useMemo } from 'react';
import { CheckCircle, Loader } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { EmptyState } from '@/components/shared/empty-state';
import { C } from '@/lib/colors';
import type { RunEvent } from '@/lib/types/playground';

type AgentState = 'pending' | 'spawning' | 'ready' | 'active';

interface AgentInfo {
  id: string;
  state: AgentState;
  aid?: string;
  port?: number;
  notes?: string;
}

export function AgentStatusGrid({ events }: { events: RunEvent[] }) {
  const agents = useMemo(() => deriveAgents(events), [events]);

  return (
    <Card style={{ padding: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: C.textMuted,
          marginBottom: 12,
          letterSpacing: '0.06em',
        }}
      >
        AGENTS
      </div>
      {agents.length === 0 ? (
        <EmptyState title="No agents yet" description="Agents will appear as they spawn." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map((a) => (
            <div
              key={a.id}
              style={{
                padding: '10px 12px',
                background: C.bg3,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <Indicator state={a.state} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: C.text,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{a.id}</span>
                  <span style={{ fontSize: 10, color: indicatorColor(a.state) }}>{a.state}</span>
                </div>
                {a.aid && (
                  <div style={{ marginTop: 4 }}>
                    <AidCell aid={a.aid} />
                  </div>
                )}
                {a.port !== undefined && (
                  <div className="mono" style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                    port :{a.port}
                  </div>
                )}
                {a.notes && (
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{a.notes}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Indicator({ state }: { state: AgentState }) {
  if (state === 'spawning' || state === 'pending') {
    return <Loader size={12} color={C.textMuted} className="spin" style={{ marginTop: 2 }} />;
  }
  if (state === 'ready') {
    return (
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: C.green,
          marginTop: 3,
        }}
      />
    );
  }
  return <CheckCircle size={12} color={C.green} style={{ marginTop: 2 }} />;
}

function indicatorColor(state: AgentState): string {
  if (state === 'ready' || state === 'active') return C.green;
  if (state === 'spawning') return C.blue;
  return C.textMuted;
}

function deriveAgents(events: RunEvent[]): AgentInfo[] {
  const map = new Map<string, AgentInfo>();
  for (const e of events) {
    if (e.type === 'agent.spawning' && e.agent_id) {
      const existing = map.get(e.agent_id);
      map.set(e.agent_id, {
        id: e.agent_id,
        state: 'spawning',
        notes: e.notes,
        aid: existing?.aid,
        port: existing?.port,
      });
    } else if (e.type === 'agent.ready' && e.agent_id) {
      const existing = map.get(e.agent_id);
      map.set(e.agent_id, {
        id: e.agent_id,
        state: 'ready',
        notes: existing?.notes,
        aid: e.aid ?? existing?.aid,
        port: e.port ?? existing?.port,
      });
    } else if (e.type === 'step.started' && e.agent) {
      const existing = map.get(e.agent);
      if (existing) map.set(e.agent, { ...existing, state: 'active' });
    } else if (e.type === 'step.complete' && e.agent) {
      const existing = map.get(e.agent);
      if (existing && existing.state === 'active') {
        map.set(e.agent, { ...existing, state: 'ready' });
      }
    }
  }
  return Array.from(map.values());
}
