'use client';

import { Fragment, useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { AidCell } from '@/components/shared/aid-cell';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { C, eventColor } from '@/lib/colors';
import type { AuditEvent } from '@/lib/types/cp';
import { shortId } from '@/lib/utils';

interface Props {
  events: AuditEvent[];
}

export function AuditTable({ events }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [justCopied, setJustCopied] = useState<string | null>(null);

  async function copyPayload(id: string, payload: unknown) {
    try {
      await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
      setJustCopied(id);
      setTimeout(() => setJustCopied((prev) => (prev === id ? null : prev)), 1_500);
    } catch {
      // Older browsers / non-secure contexts — leave the row untouched.
    }
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['When', 'Type', 'Actors', 'Grants', 'Session / Run', ''].map((h) => (
              <th
                key={h}
                scope="col"
                style={{
                  padding: '8px 14px',
                  fontSize: 10,
                  color: C.textMuted,
                  textAlign: 'left',
                  fontWeight: 500,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const expanded = open === e.id;
            return (
              <Fragment key={e.id}>
                <tr
                  style={{
                    borderBottom: `1px solid ${C.border}20`,
                    cursor: 'pointer',
                  }}
                  onClick={() => setOpen(expanded ? null : e.id)}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
                      {e.ts ? new Date(e.ts).toLocaleTimeString() : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: eventColor(e.type) }}>
                      {e.type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {e.aidA && <AidCell aid={e.aidA} />}
                      {e.aidB && <AidCell aid={e.aidB} />}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {(e.grants ?? []).map((g) => (
                        <CapabilityBadge key={g} cap={g} />
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {e.sessionId && (
                        <span className="mono" style={{ fontSize: 10, color: C.purple }}>
                          s:{shortId(e.sessionId, 10)}
                        </span>
                      )}
                      {e.runId && (
                        <span className="mono" style={{ fontSize: 10, color: C.teal }}>
                          r:{shortId(e.runId, 10)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <ChevronDown
                      size={13}
                      color={C.textMuted}
                      style={{
                        transform: expanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform .15s',
                      }}
                    />
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={6} style={{ padding: '0 14px 14px' }}>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation();
                            copyPayload(e.id, e.payload);
                          }}
                          aria-label="Copy payload as JSON"
                          title="Copy payload as JSON"
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            background: C.bg2,
                            border: `1px solid ${C.border}`,
                            borderRadius: 4,
                            padding: '3px 7px',
                            cursor: 'pointer',
                            color: justCopied === e.id ? C.green : C.textDim,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                          }}
                        >
                          {justCopied === e.id ? (
                            <>
                              <Check size={11} /> copied
                            </>
                          ) : (
                            <>
                              <Copy size={11} /> copy
                            </>
                          )}
                        </button>
                        <pre
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: C.textDim,
                            background: C.bg3,
                            borderRadius: 6,
                            padding: 12,
                            paddingRight: 80,
                            overflowX: 'auto',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
