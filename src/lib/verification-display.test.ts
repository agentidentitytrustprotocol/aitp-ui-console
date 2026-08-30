import { C } from './colors';
import { manifestVerdictBadge, revocationVerdictBadge } from './verification-display';
import type { RevocationVerdict, Verdict } from './types/cp';

describe('manifestVerdictBadge', () => {
  it('checked:true, ok:true → verified, green, teal AID', () => {
    const verdict: Verdict = { checked: true, ok: true };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.green);
    expect(badge.aidColor).toBe(C.tealBright);
    expect(badge.text).toContain('verified');
  });

  it('checked:true, ok:false, code:expired → amber, muted AID, expiry wording (not a signature failure)', () => {
    const verdict: Verdict = { checked: true, ok: false, code: 'expired' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('EXPIRED');
    expect(badge.text).toContain('signature not assessed');
    expect(badge.text).not.toContain('VERIFICATION FAILED');
  });

  it.each(['version_unknown', 'malformed'])(
    'checked:true, ok:false, code:%s (MANIFEST_UNASSESSED_CODES) → amber, muted AID, NOT VERIFIED',
    (code) => {
      const verdict: Verdict = { checked: true, ok: false, code };
      const badge = manifestVerdictBadge(verdict);
      expect(badge.color).toBe(C.amber);
      expect(badge.aidColor).toBe(C.textMuted);
      expect(badge.text).toContain('NOT VERIFIED');
      expect(badge.text).toContain(code);
      expect(badge.text).not.toContain('VERIFICATION FAILED');
    },
  );

  it('checked:true, ok:false, arbitrary other code → red, muted AID, VERIFICATION FAILED', () => {
    const verdict: Verdict = { checked: true, ok: false, code: 'signature_invalid' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('VERIFICATION FAILED');
    expect(badge.text).toContain('signature_invalid');
  });

  it('checked:false → amber, muted AID, text includes the reason', () => {
    const verdict: Verdict = { checked: false, reason: 'native addon failed to load' };
    const badge = manifestVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.aidColor).toBe(C.textMuted);
    expect(badge.text).toContain('signature not checked');
    expect(badge.text).toContain('native addon failed to load');
  });
});

describe('revocationVerdictBadge', () => {
  it("checked:true, ok:true, tier:'pinned' → green, entries not greyed, verified wording", () => {
    const verdict: RevocationVerdict = { checked: true, ok: true, tier: 'pinned' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.green);
    expect(badge.entriesGreyed).toBe(false);
    expect(badge.text).toContain('verified');
  });

  it("checked:true, ok:true, tier:'self-consistent' → dim color, entries not greyed, never says 'verified'", () => {
    const verdict: RevocationVerdict = { checked: true, ok: true, tier: 'self-consistent' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.textDim);
    expect(badge.entriesGreyed).toBe(false);
    expect(badge.text).toContain('self-consistent');
    // Documented invariant: the self-consistent tier must never claim "verified".
    expect(badge.text).not.toContain('verified');
  });

  it('checked:true, ok:false, code:expired → amber, entries greyed, expiry wording', () => {
    const verdict: RevocationVerdict = { checked: true, ok: false, code: 'expired', tier: 'pinned' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('EXPIRED');
    expect(badge.text).not.toContain('SIGNATURE INVALID');
  });

  it.each(['version_unknown', 'malformed'])(
    'checked:true, ok:false, code:%s (REVOCATION_UNASSESSED_CODES) → amber, entries greyed, NOT VERIFIED (never SIGNATURE INVALID)',
    (code) => {
      const verdict: RevocationVerdict = { checked: true, ok: false, code, tier: 'pinned' };
      const badge = revocationVerdictBadge(verdict);
      expect(badge.color).toBe(C.amber);
      expect(badge.entriesGreyed).toBe(true);
      expect(badge.text).toContain('NOT VERIFIED');
      expect(badge.text).toContain(code);
      expect(badge.text).not.toContain('SIGNATURE INVALID');
    },
  );

  it('checked:true, ok:false, code:issuer_mismatch → its own red row, entries greyed, distinct from generic signature failure', () => {
    const verdict: RevocationVerdict = {
      checked: true,
      ok: false,
      code: 'issuer_mismatch',
      tier: 'pinned',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('ISSUER MISMATCH');
    expect(badge.text).not.toContain('SIGNATURE INVALID');
  });

  it('checked:true, ok:false, arbitrary other code → red, entries greyed, SIGNATURE INVALID', () => {
    const verdict: RevocationVerdict = {
      checked: true,
      ok: false,
      code: 'signature_invalid',
      tier: 'pinned',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.red);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('SIGNATURE INVALID');
    expect(badge.text).toContain('signature_invalid');
  });

  it("checked:false, reason:'no_trusted_issuer', manifestCode:'expired' → amber, entries greyed, explains the manifest expired", () => {
    const verdict: RevocationVerdict = {
      checked: false,
      reason: 'no_trusted_issuer',
      manifestCode: 'expired',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain("manifest has expired");
    expect(badge.text).toContain('no trusted issuer is available');
  });

  it("checked:false, reason:'no_trusted_issuer', manifestCode:<other> → amber, entries greyed, mentions that manifestCode", () => {
    const verdict: RevocationVerdict = {
      checked: false,
      reason: 'no_trusted_issuer',
      manifestCode: 'signature_invalid',
    };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('manifest failed verification (signature_invalid)');
  });

  it("checked:false, reason:'no_trusted_issuer' with no manifestCode → falls through to the generic unchecked branch", () => {
    const verdict: RevocationVerdict = { checked: false, reason: 'no_trusted_issuer' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toBe('· signature not checked (no_trusted_issuer)');
  });

  it('checked:false, arbitrary other reason, no manifestCode → amber, entries greyed, generic wording', () => {
    const verdict: RevocationVerdict = { checked: false, reason: 'native addon failed to load' };
    const badge = revocationVerdictBadge(verdict);
    expect(badge.color).toBe(C.amber);
    expect(badge.entriesGreyed).toBe(true);
    expect(badge.text).toContain('signature not checked');
    expect(badge.text).toContain('native addon failed to load');
  });
});
