import { NextRequest } from 'next/server';
import { proxyGetVerified } from '@/lib/api/proxy';
import { verifyRevocationEnvelope } from '@/lib/api/verify-revocation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return proxyGetVerified('cp', '/.well-known/aitp-revocation-list', req, verifyRevocationEnvelope);
}
