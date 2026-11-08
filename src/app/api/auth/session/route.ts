import { NextRequest } from 'next/server';
import { isOperator } from '@/lib/server/access';
import { isPublicMode } from '@/lib/server/public-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the UI needs to decide what to show: whether the console is in
 *  public mode, and whether this caller is a signed-in operator. Open in
 *  public mode (`src/proxy.ts`); with the flag off the edge admits only
 *  operators, but the handler still checks the caller itself rather than
 *  assuming it. Never cached: the answer changes on
 *  sign-in and sign-out. */
export async function GET(req: NextRequest) {
  const body = {
    publicMode: isPublicMode(),
    signedIn: await isOperator(req),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
