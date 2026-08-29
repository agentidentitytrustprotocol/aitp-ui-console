import { NextRequest } from 'next/server';
import { proxyGetVerified } from '@/lib/api/proxy';
import { verifyManifestEnvelope } from '@/lib/api/verify-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyGetVerified('cp', '/.well-known/aitp-manifest', req, verifyManifestEnvelope);
}
