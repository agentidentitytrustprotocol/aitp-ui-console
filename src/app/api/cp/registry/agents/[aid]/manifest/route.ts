import { NextRequest } from 'next/server';
import { proxyGetVerified } from '@/lib/api/proxy';
import { verifyManifestEnvelope } from '@/lib/api/verify-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ aid: string }> }) {
  const { aid } = await params;
  return proxyGetVerified(
    'cp',
    `/api/registry/agents/${encodeURIComponent(aid)}/manifest`,
    req,
    verifyManifestEnvelope,
  );
}
