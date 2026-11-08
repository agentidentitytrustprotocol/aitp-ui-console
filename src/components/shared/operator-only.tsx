'use client';

import { usePathname } from 'next/navigation';
import { C } from '@/lib/colors';

/** `/login?next=<this page>`, so signing in comes straight back. The
 *  path only: `useSearchParams` would force a Suspense boundary on the
 *  topbar, which sits outside the layout's. */
export function useLoginHref(): string {
  const pathname = usePathname() || '/';
  return `/login?next=${encodeURIComponent(pathname)}`;
}

/** Shown in place of an admin section to a visitor without an operator
 *  session (public mode). The section sends no request in this state. */
export function OperatorOnly({ what }: { what?: string }) {
  const href = useLoginHref();
  return (
    <div
      role="note"
      style={{
        padding: '12px 14px',
        border: `1px dashed ${C.border}`,
        borderRadius: 8,
        fontSize: 12,
        color: C.textDim,
      }}
    >
      {what ? `${what}: operator only.` : 'Operator only.'}{' '}
      <a href={href} style={{ color: C.tealBright }}>
        Sign in
      </a>{' '}
      to see this.
    </div>
  );
}
