import { NextRequest } from 'next/server';
import { proxyGet } from '@/lib/api/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Playground exposes this as /runs/:id/cp-deliveries — we keep the
 *  console-facing path stable as /deliveries. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyGet('playground', `/runs/${encodeURIComponent(id)}/cp-deliveries`, req);
}
