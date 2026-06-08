'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { InlineSpinner } from '@/components/shared/loading-skeleton';
import { Modal } from '@/components/shared/modal';
import { useToast } from '@/components/shared/toast';
import { useCreateEnrollmentToken } from '@/hooks/use-enrollment';
import { C } from '@/lib/colors';
import type { EnrollmentToken } from '@/lib/types/cp';

export function EnrollmentModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [json, setJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const create = useCreateEnrollmentToken();
  const [issued, setIssued] = useState<EnrollmentToken | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!issued) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    return () => clearInterval(t);
  }, [issued]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setParseError(null);
    let parsed: { manifest?: unknown; signature?: string; proof_of_possession?: string };
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      setParseError(`Manifest is not valid JSON: ${String(err)}`);
      return;
    }
    if (!parsed.manifest || typeof parsed.manifest !== 'object') {
      setParseError('Expected an object with a top-level `manifest` field.');
      return;
    }
    create.mutate(
      {
        manifest: parsed.manifest as never,
        signature: parsed.signature,
        proof_of_possession: parsed.proof_of_possession,
      },
      {
        onSuccess: (token) => {
          setIssued(token);
          toast.success('Enrollment token minted', `expires in ${Math.floor((token.exp - Math.floor(Date.now() / 1000)) / 60)} min`);
        },
        onError: (err) => toast.error('Failed to mint token', String(err)),
      },
    );
  }

  const remaining = issued ? Math.max(0, issued.exp - now) : 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!create.isPending}
      title={
        <>
          <KeyRound size={15} color={C.teal} />
          New enrollment token
        </>
      }
    >
        {!issued ? (
          <form onSubmit={submit}>
            <label style={{ fontSize: 11, color: C.textDim, display: 'block', marginBottom: 6 }}>
              Signed manifest envelope (JSON)
            </label>
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              required
              placeholder={'{"manifest": { "aid": "aid:pubkey:..." }, "signature": "..."}'}
              spellCheck={false}
              rows={10}
              style={{
                width: '100%',
                background: C.bg3,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: 10,
                color: C.text,
                fontSize: 12,
                fontFamily: 'JetBrains Mono',
                outline: 'none',
                marginBottom: 12,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
              The CP validates the signature and mints a one-time bearer token (5-minute TTL) the
              agent uses to register itself. Tokens are JTI-bound and cannot be re-used.
            </div>
            {(parseError || create.error) && (
              <div
                style={{
                  background: C.red + '15',
                  border: `1px solid ${C.red}40`,
                  color: C.red,
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 11,
                  marginBottom: 12,
                }}
              >
                {parseError ?? String(create.error)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '8px 14px',
                  color: C.textDim,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending || !json}
                style={{
                  background: C.teal,
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 14px',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: create.isPending ? 0.7 : 1,
                }}
              >
                {create.isPending && <InlineSpinner color="#fff" />}
                Mint token
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div
              style={{
                padding: 14,
                background: C.green + '12',
                border: `1px solid ${C.green}40`,
                borderRadius: 6,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>
                  Token expires in {mins}:{String(secs).padStart(2, '0')}
                </span>
                <span className="mono" style={{ fontSize: 10, color: C.textMuted }}>
                  jti: {issued.jti}
                </span>
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: revealed ? C.text : C.textMuted,
                  wordBreak: 'break-all',
                  background: C.bg3,
                  padding: 10,
                  borderRadius: 4,
                  marginBottom: 8,
                  filter: revealed ? 'none' : 'blur(3px)',
                  cursor: 'pointer',
                  userSelect: revealed ? 'text' : 'none',
                }}
                onClick={() => setRevealed(true)}
              >
                {issued.token}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setRevealed((r) => !r)}
                  style={{
                    background: 'none',
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '5px 10px',
                    color: C.textDim,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {revealed ? 'Hide' : 'Reveal'}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(issued.token);
                    toast.success('Token copied to clipboard');
                  }}
                  style={{
                    background: C.teal,
                    border: 'none',
                    borderRadius: 4,
                    padding: '5px 10px',
                    color: '#fff',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Copy size={11} /> Copy
                </button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 12 }}>
              Pass this token in the <span className="mono">Authorization: Bearer</span> header on a
              single <span className="mono">POST /api/registry/agents</span> call. CP rejects re-use.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  background: C.bg3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '8px 14px',
                  color: C.textDim,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
    </Modal>
  );
}
