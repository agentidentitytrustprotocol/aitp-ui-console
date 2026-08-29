import { verifyManifestJson } from 'aitp';
import type { Verdict } from '../types/cp';

/**
 * Verify a manifest envelope's exact upstream JSON text via the SDK.
 * Never canonicalizes, never checks a signature by hand — every check
 * routes through `verifyManifestJson`, which is self-contained: it checks
 * the signature under the key embedded in the manifest's own `aid`, so no
 * pinned identity is required. See Phase 3 of
 * plans/cp-signed-artifact-verification.md.
 *
 * `verifyManifestJson` throws synchronously on any failure (not a rejected
 * promise) and sets `.code` to the SDK's stable error code
 * (`signature_invalid`, `expired`, `malformed`, etc.) — branch on that,
 * never on `.message`.
 */
export function verifyManifestEnvelope(rawText: string): Verdict {
  try {
    verifyManifestJson(rawText);
    return { checked: true, ok: true };
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (typeof code === 'string') return { checked: true, ok: false, code };
    // The SDK is expected to always throw a coded error; a code-less throw
    // means something failed before verification could even run (the
    // canonical example: the native addon didn't load). That's a
    // console-side failure, not a verification failure -- don't conflate
    // the two by reporting it as `ok: false`.
    return { checked: false, reason: 'sdk_unavailable' };
  }
}
