'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Loader,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';
import type { RunEvent } from '@/lib/types/playground';

function formatOffset(ms: number): string {
  if (ms < 1_000) return `+${ms}ms`;
  if (ms < 60_000) return `+${(ms / 1_000).toFixed(1)}s`;
  return `+${(ms / 60_000).toFixed(1)}m`;
}

export function EventCard({ evt }: { evt: RunEvent }) {
  const offset = formatOffset(evt.ts);

  switch (evt.type) {
    case 'run.started':
      return (
        <Line color={C.purple}>
          <span style={{ fontSize: 12, color: C.purple }}>Scenario run started</span>
          {evt.scenario_ref && <CapabilityBadge cap={evt.scenario_ref} />}
        </Line>
      );

    case 'agent.spawning':
      return (
        <Line color={C.textMuted} dotClass="pulse">
          <span style={{ fontSize: 12, color: C.textDim }}>
            Spawning <span style={{ color: C.text }}>{evt.agent_id}</span>
            {evt.notes && <span style={{ color: C.textMuted }}> ({evt.notes})</span>}
          </span>
          <Loader size={11} color={C.textMuted} className="spin" />
        </Line>
      );

    case 'agent.ready':
      return (
        <Line color={C.green} ts={offset}>
          <span style={{ fontSize: 12, color: C.text }}>{evt.agent_id}</span>
          <span style={{ fontSize: 12, color: C.green }}>ready</span>
          {evt.port !== undefined && (
            <span className="mono" style={{ fontSize: 10, color: C.textMuted }}>
              :{evt.port}
            </span>
          )}
          {evt.aid && <AidCell aid={evt.aid} />}
        </Line>
      );

    case 'trust.peers_resolved':
      return (
        <Line color={C.blue} ts={offset}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            Peer manifest URLs resolved ({Object.keys(evt.peers ?? {}).length})
          </span>
        </Line>
      );

    case 'trust.establishing':
      return (
        <Line color={C.blue} dotClass="pulse" ts={offset}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {evt.initiator} <span style={{ color: C.blue }}>⇒</span> {evt.target}: establishing trust…
          </span>
        </Line>
      );

    case 'trust.established':
      return (
        <div style={{ marginBottom: 10 }} className="anim-in">
          <Line color={C.blue} ts={offset}>
            <ShieldCheck size={12} color={C.blue} />
            <span style={{ fontSize: 12, color: C.blue }}>Trust established</span>
          </Line>
          <TrustFlowCard evt={evt} />
        </div>
      );

    case 'step.started':
      return (
        <Line color={C.amber} ts={offset} dotIcon={<Zap size={11} color={C.amber} />}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            Step <span style={{ color: C.text }}>{evt.step_id}</span>
          </span>
          {evt.capability && <CapabilityBadge cap={evt.capability} />}
          {evt.agent && <span style={{ fontSize: 12, color: C.textDim }}>on {evt.agent}</span>}
        </Line>
      );

    case 'step.probing_no_trust':
      return (
        <Line color={C.amber} ts={offset}>
          <span style={{ fontSize: 12, color: C.amber }}>
            Probing without TCT → expect 403
          </span>
        </Line>
      );

    case 'step.access_denied':
      return (
        <Card style={{ padding: '10px 14px', borderLeft: `3px solid ${C.red}`, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <XCircle size={14} color={C.red} />
            <span style={{ fontSize: 12, color: C.red, fontWeight: 500 }}>403 Access Denied</span>
            {evt.capability && <CapabilityBadge cap={evt.capability} />}
          </div>
        </Card>
      );

    case 'llm.started': {
      const model = typeof evt.payload?.model === 'string' ? evt.payload.model : 'LLM';
      return (
        <Line color={C.green} ts={offset} dotIcon={<Loader size={11} color={C.green} className="spin" />}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {evt.agent_id ?? evt.agent} calling{' '}
            <span style={{ color: C.green }}>{model}</span>…
          </span>
        </Line>
      );
    }

    case 'llm.complete': {
      const tokens = evt.payload?.tokens_used;
      return (
        <Line color={C.green} ts={offset} dotIcon={<CheckCircle size={11} color={C.green} />}>
          <span style={{ fontSize: 12, color: C.textDim }}>
            {evt.agent_id ?? evt.agent} ✓ LLM call complete
          </span>
          {tokens !== undefined && (
            <span className="mono" style={{ fontSize: 10, color: C.textMuted }}>
              {String(tokens)} tokens
            </span>
          )}
        </Line>
      );
    }

    case 'step.complete':
      return (
        <div style={{ marginBottom: 10 }} className="anim-in">
          <Line color={C.amber} ts={offset} dotIcon={<CheckCircle size={11} color={C.amber} />}>
            <span style={{ fontSize: 12, color: C.amber }}>Step complete: {evt.step_id}</span>
          </Line>
          <StepOutputCard evt={evt} />
        </div>
      );

    case 'run.complete':
      return (
        <Card style={{ padding: 16, borderLeft: `3px solid ${C.green}`, marginTop: 12 }} className="anim-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CheckCircle size={16} color={C.green} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.green }}>Run complete</span>
            <span
              className="mono"
              style={{ fontSize: 10, color: C.textMuted, marginLeft: 'auto' }}
            >
              {offset}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.textDim }}>
            Total elapsed: {(evt.ts / 1000).toFixed(1)}s
          </div>
        </Card>
      );

    case 'run.failed':
      return (
        <Card style={{ padding: 16, borderLeft: `3px solid ${C.red}`, marginTop: 12 }} className="anim-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color={C.red} />
            <span style={{ fontSize: 14, fontWeight: 600, color: C.red }}>Run failed</span>
          </div>
          {evt.error && <div style={{ fontSize: 12, color: C.textDim }}>{evt.error}</div>}
        </Card>
      );

    default:
      return (
        <Line color={C.textMuted} ts={offset}>
          <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
            {evt.type}
          </span>
        </Line>
      );
  }
}

function Line({
  color,
  children,
  ts,
  dotClass,
  dotIcon,
}: {
  color: string;
  children: React.ReactNode;
  ts?: string;
  dotClass?: string;
  dotIcon?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      {dotIcon ?? (
        <div
          className={dotClass}
          style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
        />
      )}
      {ts && (
        <span className="mono" style={{ fontSize: 10, color: C.textMuted, minWidth: 48 }}>
          {ts}
        </span>
      )}
      {children}
    </div>
  );
}

export function TrustFlowCard({ evt }: { evt: RunEvent }) {
  return (
    <Card style={{ padding: '14px 16px', borderLeft: `3px solid ${C.blue}`, marginTop: 4 }}>
      <div
        style={{
          fontSize: 11,
          color: C.blue,
          marginBottom: 12,
          fontWeight: 600,
          letterSpacing: '0.05em',
        }}
      >
        AITP MUTUAL HANDSHAKE
      </div>
      {(
        [
          ['MUTUAL_HELLO', '→', C.teal],
          ['MUTUAL_HELLO_ACK', '←', C.blue],
          ['MUTUAL_COMMIT', '→', C.teal],
          ['MUTUAL_COMMIT_ACK + TCT', '←', C.green],
        ] as const
      ).map(([msg, dir, col]) => (
        <div
          key={msg}
          style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, fontSize: 11 }}
        >
          <span className="mono" style={{ color: C.textDim, minWidth: 80 }}>
            {evt.initiator}
          </span>
          <span style={{ color: col }}>{dir === '→' ? '─────' : ''}</span>
          <span
            className="mono"
            style={{ color: col, fontSize: 10, flex: 1, textAlign: 'center' }}
          >
            {msg}
          </span>
          <span style={{ color: col }}>{dir === '←' ? '─────' : ''}</span>
          <span className="mono" style={{ color: C.textDim, minWidth: 60, textAlign: 'right' }}>
            {evt.target}
          </span>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          gap: 24,
          marginTop: 10,
          padding: '8px 10px',
          background: C.bg3,
          borderRadius: 5,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>TCT GRANTS</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(evt.grants ?? []).map((g) => (
              <CapabilityBadge key={g} cap={g} />
            ))}
            {(evt.grants ?? []).length === 0 && (
              <span style={{ fontSize: 10, color: C.textMuted }}>none</span>
            )}
          </div>
        </div>
        {evt.jti && (
          <div>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>JTI</div>
            <span className="mono" style={{ fontSize: 10, color: C.textDim }}>
              {shortId(evt.jti, 18)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

export function StepOutputCard({ evt }: { evt: RunEvent }) {
  const [open, setOpen] = useState(false);
  const result = evt.result as Record<string, unknown> | undefined;

  if (!result) return null;

  return (
    <Card style={{ borderLeft: `3px solid ${C.amber}`, marginTop: 4 }}>
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: C.amber,
              fontWeight: 600,
              letterSpacing: '0.05em',
              marginBottom: 3,
            }}
          >
            STEP COMPLETE · <span className="mono">{evt.step_id?.toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 12, color: C.textDim }}>
            {evt.agent ?? evt.agent_id} {evt.capability && '· '}
            {evt.capability && <CapabilityBadge cap={evt.capability} />}
          </div>
        </div>
        <ChevronDown
          size={14}
          color={C.textMuted}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        />
      </div>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {Object.entries(result).map(([k, v]) => (
            <div
              key={k}
              style={{ background: C.bg3, borderRadius: 6, padding: 12, marginBottom: 8 }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: C.textMuted,
                  marginBottom: 6,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {k}
              </div>
              <div
                className={typeof v === 'object' ? 'mono' : undefined}
                style={{
                  fontSize: typeof v === 'object' ? 11 : 12,
                  color: C.textDim,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
