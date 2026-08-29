import { NextResponse } from 'next/server';
import { verifyManifestJson } from 'aitp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THROWAWAY — Phase 2 of plans/cp-signed-artifact-verification.md.
// Exists only to prove the native `aitp` addon loads in a Vercel serverless
// function and that `verifyManifestJson` actually runs (and throws on a
// known-bad envelope) there, not just locally. Delete this route, the
// `aitp` dependency, and the next.config.ts additions once the preview
// deployment has been checked and the answer recorded in the plan.
const KNOWN_BAD_ENVELOPE = JSON.stringify({
  manifest: {
    aid: 'aid:pubkey:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    display_name: 'throwaway-check',
    handshake_endpoint: 'https://example.invalid/handshake',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    signature: 'not-a-real-signature',
  },
});

export async function GET() {
  let threw = false;
  try {
    verifyManifestJson(KNOWN_BAD_ENVELOPE);
  } catch {
    threw = true;
  }
  return NextResponse.json({ ok: true, threw });
}
