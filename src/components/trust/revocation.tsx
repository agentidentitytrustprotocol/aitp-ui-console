'use client';

import { useMemo, useState } from 'react';
import { Ban, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { AidCell } from '@/components/shared/aid-cell';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton, InlineSpinner } from '@/components/shared/loading-skeleton';
import { TimeAgo } from '@/components/shared/time-ago';
import { useCreateRevocation, useIssuerRevocations, useTcts } from '@/hooks/use-trust';
import { useCpMetrics } from '@/hooks/use-playground-meta';
import { useToast } from '@/components/shared/toast';
import { C } from '@/lib/colors';
import { parseIssuerLastPulls } from '@/lib/revocation-relay';
import type { IssuerRevocations } from '@/lib/types/cp';

/** The CP's TCT projection is the only issuer index it has; the CP caps a
 *  page at 1000. */
const TCT_SCAN_LIMIT = 1000;

/**
 * Revocations grouped by issuer AID. The CP is a registry and relay
 * (RFC-AITP-0008 §1.5): it records entries per issuer and each issuer pulls,
 * signs and serves its own list. There is no CP-signed list.
 */
export function RevocationView() {
  const toast = useToast();
  const tcts = useTcts({ limit: TCT_SCAN_LIMIT });
  const metrics = useCpMetrics();
  const create = useCreateRevocation();
  const [jti, setJti] = useState('');
  const [iss, setIss] = useState('');
  const [reason, setReason] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  // Issuers the operator revoked against this session: shown even when the
  // CP has no TCT from them in its projection.
  const [named, setNamed] = useState<string[]>([]);
  // Issuers the operator expanded by hand.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());

  const tctIssuers = useMemo(() => {
    const byJti = new Map<string, string>();
    for (const t of tcts.data?.tcts ?? []) byJti.set(t.jti, t.issuer);
    return byJti;
  }, [tcts.data]);

  const lastPulls = useMemo(() => parseIssuerLastPulls(metrics.data ?? ''), [metrics.data]);
  // A CP can know hundreds of TCT issuers, and each issuer's entries are a
  // separate request, so a group is fetched only when it is open. Open by
  // default: issuers that pull from the relay, issuers revoked against in
  // this session, and the issuer named in the form.
  const formIss = iss.trim();
  const isOpen = (a: string) =>
    opened.has(a) || lastPulls.has(a) || named.includes(a) || a === formIss;
  const issuers = useMemo(() => {
    const all = [...new Set([...tctIssuers.values(), ...named])].filter((a) =>
      a.startsWith('aid:'),
    );
    const auto = (a: string) => lastPulls.has(a) || named.includes(a);
    return all.sort((a, b) => Number(auto(b)) - Number(auto(a)) || a.localeCompare(b));
  }, [tctIssuers, named, lastPulls]);
  const results = useIssuerRevocations(issuers, isOpen);

  function toggle(a: string) {
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }

  function reset() {
    setJti('');
    setIss('');
    setReason('');
    setConfirmStep(false);
  }

  function onJti(value: string) {
    setJti(value);
    // Prefill the issuer from the TCT the CP recorded for this jti.
    const known = tctIssuers.get(value.trim());
    if (known) setIss(known);
  }

  function startConfirm(e: React.FormEvent) {
    e.preventDefault();
    setConfirmStep(true);
  }

  function actuallyRevoke() {
    const issuer = iss.trim();
    create.mutate(
      { jti: jti.trim(), iss: issuer, reason: reason || undefined },
      {
        onSuccess: () => {
          toast.success('Revocation recorded', jti);
          setNamed((n) => (n.includes(issuer) ? n : [...n, issuer]));
          reset();
        },
        onError: (err) => toast.error('Revocation failed', String(err)),
      },
    );
  }

  const ready = !!jti.trim() && !!iss.trim();

  return (
    <Card style={{ padding: 0 }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${C.border}`,
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ban size={14} color={C.red} /> Revocations by issuer
        <span className="mono" style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>
          {issuers.length} {issuers.length === 1 ? 'issuer' : 'issuers'}
        </span>
      </div>

      <div
        style={{
          padding: '8px 18px',
          fontSize: 10,
          color: C.textDim,
          borderBottom: `1px solid ${C.border}`,
          lineHeight: 1.5,
        }}
      >
        The CP records and relays entries; each issuer pulls its own, signs them and serves its
        list (RFC-AITP-0008 §1.5). An entry takes effect at the issuer&apos;s next pull.
      </div>

      <form
        onSubmit={startConfirm}
        style={{
          padding: 14,
          background: C.bg3,
          borderBottom: `1px solid ${C.border}`,
          display: 'grid',
          gridTemplateColumns: '2fr 2fr 2fr auto',
          gap: 8,
          alignItems: 'end',
        }}
      >
        <Field label="JTI to revoke">
          <input
            value={jti}
            onChange={(e) => onJti(e.target.value)}
            required
            placeholder="UUID of a TCT or delegation"
            style={{ ...inputStyle, fontFamily: 'JetBrains Mono' }}
          />
        </Field>
        <Field label="Issuer AID">
          <input
            value={iss}
            onChange={(e) => setIss(e.target.value)}
            required
            list="revocation-issuers"
            placeholder="aid:… (prefilled from the TCT)"
            style={{ ...inputStyle, fontFamily: 'JetBrains Mono' }}
          />
          <datalist id="revocation-issuers">
            {issuers.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Reason (optional, ≤500 chars)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="key-compromise / unenrolled / …"
            style={inputStyle}
          />
        </Field>
        <button
          type="submit"
          disabled={!ready || create.isPending}
          style={{
            background: C.red,
            border: 'none',
            color: '#fff',
            fontSize: 12,
            padding: '8px 14px',
            borderRadius: 5,
            cursor: ready ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: ready ? 1 : 0.5,
          }}
        >
          <Ban size={12} /> Revoke
        </button>
      </form>

      {confirmStep && (
        <div
          style={{
            padding: 14,
            background: C.red + '12',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: 12, color: C.red, fontWeight: 600, marginBottom: 6 }}>
            Confirm revocation
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>
            Revoking <span className="mono" style={{ color: C.red }}>{jti}</span> as issuer{' '}
            <span className="mono" style={{ color: C.text }}>{iss}</span> propagates to any
            downstream delegation that includes this jti. It takes effect when that issuer next
            pulls and re-signs its list. The operation is logged in the admin audit trail and
            cannot be reversed.
          </div>
          {create.error && (
            <div
              style={{
                background: C.red + '20',
                border: `1px solid ${C.red}40`,
                color: C.red,
                padding: 8,
                borderRadius: 4,
                fontSize: 11,
                marginBottom: 10,
              }}
            >
              {String(create.error)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmStep(false)}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                padding: '6px 12px',
                color: C.textDim,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={actuallyRevoke}
              disabled={create.isPending}
              style={{
                background: C.red,
                border: 'none',
                borderRadius: 5,
                padding: '6px 12px',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {create.isPending && <InlineSpinner color="#fff" />}
              Yes, revoke
            </button>
          </div>
        </div>
      )}

      {tcts.isLoading ? (
        <div style={{ padding: 20 }}>
          <LoadingSkeleton rows={3} />
        </div>
      ) : issuers.length === 0 ? (
        <EmptyState
          title={tcts.error ? "Couldn't load issuers" : 'No issuers yet'}
          description={
            tcts.error
              ? 'Check Control Plane connection.'
              : 'Issuers appear once the CP has recorded a TCT, or after you revoke against one.'
          }
        />
      ) : (
        issuers.map((aid, i) => (
          <IssuerGroup
            key={aid}
            aid={aid}
            open={isOpen(aid)}
            onToggle={() => toggle(aid)}
            data={results[i]?.data}
            isLoading={!!results[i]?.isLoading}
            error={!!results[i]?.error}
            lastPull={lastPulls.get(aid)}
          />
        ))
      )}
    </Card>
  );
}

function IssuerGroup({
  aid,
  open,
  onToggle,
  data,
  isLoading,
  error,
  lastPull,
}: {
  aid: string;
  open: boolean;
  onToggle: () => void;
  data: IssuerRevocations | undefined;
  isLoading: boolean;
  error: boolean;
  lastPull: number | undefined;
}) {
  const entries = data?.entries ?? [];
  return (
    <section aria-label={`Issuer ${aid}`} style={{ borderBottom: `1px solid ${C.border}` }}>
      <div
        style={{
          padding: '10px 14px',
          background: C.bg2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 11,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} entries for ${aid}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: C.textDim,
            cursor: 'pointer',
            display: 'flex',
          }}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <AidCell aid={aid} headLen={12} tailLen={6} />
        {open && data && (
          <span style={{ color: C.textMuted }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: lastPull ? C.textDim : C.amber }}>
          {lastPull ? (
            <>
              last pull <TimeAgo ts={lastPull} />
            </>
          ) : (
            'no pull recorded'
          )}
        </span>
      </div>
      {!open ? null : isLoading ? (
        <div style={{ padding: '8px 14px', fontSize: 11, color: C.textMuted }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: '8px 14px', fontSize: 11, color: C.amber }}>
          Couldn&apos;t load this issuer&apos;s entries.
        </div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '8px 14px', fontSize: 11, color: C.textMuted }}>No revocations.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['JTI', 'Reason', 'Revoked at'].map((h) => (
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
            {entries.map((e) => (
              <tr key={e.jti} style={{ borderBottom: `1px solid ${C.border}20` }}>
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 10, color: C.red }} title={e.jti}>
                    {e.jti}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  {e.reason ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: C.textDim }}>
                  <TimeAgo ts={e.revoked_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: C.bg2,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: '6px 9px',
  color: C.text,
  fontSize: 12,
  outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 10, color: C.textMuted, marginBottom: 4, display: 'block' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
