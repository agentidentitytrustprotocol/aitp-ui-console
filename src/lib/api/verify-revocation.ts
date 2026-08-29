import { verifyManifestJson, verifyRevocationList } from 'aitp';
import { serverConfig } from '../config';
import { fetchUpstreamText } from './proxy';
import type { RevocationTier, RevocationVerdict } from '../types/cp';

function codeOf(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function verifyAgainst(bodyText: string, expectedIssuer: string, tier: RevocationTier): RevocationVerdict {
  try {
    verifyRevocationList(bodyText, expectedIssuer);
    return { checked: true, ok: true, tier };
  } catch (err) {
    const code = codeOf(err);
    // A coded throw is a real verdict (ok: false). Anything else means the
    // check didn't run at all -- never render that as a rejected artifact.
    if (!code) return { checked: false, reason: 'sdk_unavailable' };
    return { checked: true, ok: false, code, tier };
  }
}

/**
 * Resolve Tier 1's expected issuer: fetch the CP's own manifest directly
 * (not through this console's own BFF route -- that would be a wasted
 * self-referential hop) and verify it. An unverified manifest cannot
 * supply the expected issuer -- that would be Finding 2 recurring one
 * level down -- so any non-`ok` manifest verdict here means Tier 1 cannot
 * proceed, and the caller must not fall back to
 * `envelope.revocation_list.issuer`: that's the artifact nominating its
 * own verifier.
 */
async function resolveSelfConsistentIssuer(
  signal: AbortSignal,
): Promise<{ aid: string } | { reason: string; manifestCode?: string }> {
  let text: string;
  try {
    ({ text } = await fetchUpstreamText('cp', '/.well-known/aitp-manifest', signal));
  } catch {
    return { reason: 'manifest_unreachable' };
  }
  try {
    verifyManifestJson(text);
  } catch (err) {
    return { reason: 'no_trusted_issuer', manifestCode: codeOf(err) ?? 'sdk_unavailable' };
  }
  const { manifest } = JSON.parse(text) as { manifest: { aid: string } };
  return { aid: manifest.aid };
}

/**
 * Verify a revocation-list envelope's exact upstream JSON text, in two
 * tiers. Never `envelope.revocation_list.issuer` as the expected issuer --
 * not as a fallback, not with a warning label -- that lets the artifact
 * nominate its own verifier, which the playground refuses by the same
 * name. See Phase 4 of plans/cp-signed-artifact-verification.md.
 *
 * - `CP_AID` set → Tier 2 ("pinned"): verify against the pinned identity.
 *   No manifest fetch needed.
 * - `CP_AID` unset → Tier 1 ("self-consistent"): verify against the AID
 *   the CP's own *verified* manifest carries. Proves one key signed both
 *   artifacts served by the same origin -- not that the origin itself is
 *   authentic. Never rendered as "verified".
 */
export async function verifyRevocationEnvelope(
  bodyText: string,
  signal: AbortSignal,
): Promise<RevocationVerdict> {
  if (serverConfig.cpAid) {
    return verifyAgainst(bodyText, serverConfig.cpAid, 'pinned');
  }

  const issuer = await resolveSelfConsistentIssuer(signal);
  if (!('aid' in issuer)) {
    return { checked: false, reason: issuer.reason, ...(issuer.manifestCode && { manifestCode: issuer.manifestCode }) };
  }
  return verifyAgainst(bodyText, issuer.aid, 'self-consistent');
}
