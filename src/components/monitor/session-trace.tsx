'use client';

import { useState } from 'react';
import { ArrowLeft, Download, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/shared/card';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { EventRow } from './event-row';
import { useSession, useSessionReplay } from '@/hooks/use-sessions';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';

const HANDSHAKE_MESSAGES = [
  { name: 'MUTUAL_HELLO', dir: 'right' as const, color: C.teal },
  { name: 'MUTUAL_HELLO_ACK', dir: 'left' as const, color: C.blue },
  { name: 'MUTUAL_COMMIT', dir: 'right' as const, color: C.teal },
  { name: 'MUTUAL_COMMIT_ACK + TCT', dir: 'left' as const, color: C.green },
];

export function SessionTrace({ sessionId }: { sessionId: string }) {
  const { data, isLoading, error } = useSession(sessionId);
  const [replayOpen, setReplayOpen] = useState(false);
  const replay = useSessionReplay(sessionId, replayOpen);

  const exportHref = `/api/cp/sessions/${encodeURIComponent(sessionId)}/export`;

  return (
    <div className="anim-in">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/monitor"
          style={{
            color: C.textDim,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
        >
          <ArrowLeft size={14} /> Monitor
        </Link>
        <span className="mono" style={{ fontSize: 12, color: C.teal }}>
          {shortId(sessionId, 24)}
        </span>
        {data?.session && <StatusBadge status={data.session.status} />}
        {data?.session && <BoundaryBadge boundary={data.session.boundary} />}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => setReplayOpen(true)}
            disabled={replayOpen && replay.isFetching}
            aria-label="Replay handshake"
            title="Replay the handshake exchange"
            style={headerButtonStyle}
          >
            {replayOpen && replay.isFetching ? <InlineSpinner /> : <RotateCcw size={12} />}
            Replay
          </button>
          <a
            href={exportHref}
            download={`session-${shortId(sessionId, 12)}.json`}
            aria-label="Download session bundle"
            title="Download the full session bundle as JSON"
            style={{ ...headerButtonStyle, textDecoration: 'none' }}
          >
            <Download size={12} /> Download
          </a>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error || !data ? (
        <Card style={{ padding: 20 }}>
          <EmptyState title="Session not found" description={sessionId} />
        </Card>
      ) : (
        <>
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                color: C.blue,
                marginBottom: 18,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              AITP MUTUAL HANDSHAKE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20 }}>
              <ActorColumn label="Initiator" aid={data.session.aidA} />
              <ActorColumn label="Responder" aid={data.session.aidB} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {HANDSHAKE_MESSAGES.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2fr 1fr',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 11,
                    color: msg.color,
                    fontFamily: 'JetBrains Mono',
                  }}
                >
                  <span style={{ textAlign: 'right', color: C.textDim }}>
                    {msg.dir === 'right' ? '●' : ''}
                  </span>
                  <span
                    style={{
                      textAlign: 'center',
                      borderTop: `1px solid ${msg.color}50`,
                      paddingTop: 4,
                    }}
                  >
                    {msg.dir === 'right' ? `─────► ${msg.name} ─────►` : `◄───── ${msg.name} ◄─────`}
                  </span>
                  <span style={{ textAlign: 'left', color: C.textDim }}>
                    {msg.dir === 'left' ? '●' : ''}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
              <TctSummary label="Initiator holds" grants={data.session.grants} />
              <TctSummary label="Responder holds" grants={data.session.grants} />
            </div>
            {data.session.error && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 6,
                  background: C.red + '15',
                  border: `1px solid ${C.red}40`,
                  color: C.red,
                  fontSize: 12,
                }}
              >
                Error: {data.session.error}
              </div>
            )}
          </Card>

          {replayOpen && (
            <Card style={{ marginBottom: 16 }}>
              <div
                style={{
                  padding: '14px 18px',
                  borderBottom: `1px solid ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.text,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <RotateCcw size={13} color={C.teal} /> Replay result
                </span>
                <button
                  onClick={() => setReplayOpen(false)}
                  aria-label="Close replay panel"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: C.textMuted,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
              <div style={{ padding: 16 }}>
                {replay.isLoading || replay.isFetching ? (
                  <LoadingSkeleton rows={4} />
                ) : replay.error ? (
                  <EmptyState
                    title="Replay failed"
                    description={String(replay.error)}
                  />
                ) : (
                  <pre
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: C.textDim,
                      background: C.bg3,
                      borderRadius: 6,
                      padding: 12,
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 400,
                      overflowY: 'auto',
                    }}
                  >
                    {JSON.stringify(replay.data, null, 2)}
                  </pre>
                )}
              </div>
            </Card>
          )}

          <Card>
            <div
              style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: 13,
                fontWeight: 500,
                color: C.text,
              }}
            >
              Raw events ({data.events.length})
            </div>
            {data.events.length === 0 ? (
              <EmptyState title="No raw events" description="Partial trace — no CP audit events were recorded for this session." />
            ) : (
              <div>
                {data.events.map((e) => (
                  <EventRow key={`${e.id}-${e.ts}`} event={e} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const headerButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: '4px 9px',
  color: C.textDim,
  fontSize: 11,
  cursor: 'pointer',
};

function ActorColumn({ label, aid }: { label: string; aid: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.06em' }}>{label.toUpperCase()}</div>
      <div className="mono" style={{ fontSize: 11, color: C.tealBright, wordBreak: 'break-all' }}>
        {aid ?? '—'}
      </div>
    </div>
  );
}

function TctSummary({ label, grants }: { label: string; grants: string[] }) {
  return (
    <div
      style={{
        padding: 12,
        background: C.bg3,
        borderRadius: 6,
        border: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6 }}>{label.toUpperCase()}</div>
      {grants.length === 0 ? (
        <span style={{ fontSize: 11, color: C.textMuted }}>no grants</span>
      ) : (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {grants.map((g) => (
            <CapabilityBadge key={g} cap={g} />
          ))}
        </div>
      )}
    </div>
  );
}
