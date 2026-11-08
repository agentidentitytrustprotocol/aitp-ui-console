'use client';

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { getJSON } from '@/lib/api/client';

/** `GET /api/auth/session`: whether the console runs in public mode and
 *  whether this caller is a signed-in operator. */
export interface ConsoleSession {
  publicMode: boolean;
  signedIn: boolean;
}

export type OperatorStatus = 'operator' | 'anonymous' | 'loading';

export interface OperatorAccess {
  status: OperatorStatus;
  /** True only once the caller is known to be an operator. Admin queries
   *  are `enabled` on this, and admin mutations refuse without it, so an
   *  anonymous visitor (or one whose status is still loading) never sends
   *  a request to an admin route. */
  canAdmin: boolean;
  /** Public mode, once known; `false` while loading. */
  publicMode: boolean;
}

export const SESSION_QUERY_KEY = ['console-session'] as const;

/** Map the session answer to an access status.
 *  - flag off → operator: only operators get past the edge, so the UI
 *    looks exactly as it did before public mode existed;
 *  - flag on → operator iff signed in;
 *  - endpoint failed or answered something unrecognisable → anonymous.
 *    This fails closed for admin UI only; the server enforces access on
 *    every call regardless of what the UI decides. */
export function accessFrom(
  data: unknown,
  state: { isPending: boolean; isError: boolean },
): OperatorAccess {
  if (state.isPending && !state.isError)
    return { status: 'loading', canAdmin: false, publicMode: false };
  const s = data as Partial<ConsoleSession> | undefined;
  const valid =
    !state.isError &&
    !!s &&
    typeof s.publicMode === 'boolean' &&
    typeof s.signedIn === 'boolean';
  if (!valid) return { status: 'anonymous', canAdmin: false, publicMode: true };
  const operator = !s.publicMode || s.signedIn === true;
  return {
    status: operator ? 'operator' : 'anonymous',
    canAdmin: operator,
    publicMode: s.publicMode === true,
  };
}

/** With no provider mounted (unit tests that render one component), the
 *  console behaves as with the flag off. The app always mounts
 *  `ConsoleSessionProvider` in `Providers`, so production never takes
 *  this default. */
const FLAG_OFF: OperatorAccess = {
  status: 'operator',
  canAdmin: true,
  publicMode: false,
};

const AccessContext = createContext<OperatorAccess>(FLAG_OFF);

export function useConsoleSession(initial?: ConsoleSession) {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => getJSON<ConsoleSession>('/api/auth/session'),
    // The server's answer from the layout render seeds the cache, so the
    // first paint already knows the mode and the caller.
    initialData: initial,
    // Changes only on sign-in/out, both of which reload the page.
    staleTime: initial ? Infinity : 5 * 60_000,
    refetchOnWindowFocus: false,
    // With the flag off every visitor got past the edge as an operator;
    // there is nothing to ask the endpoint.
    enabled: !initial || initial.publicMode,
  });
}

/** Reads the session once for the whole tree and shares the result.
 *  `initial` is the server's answer from rendering the layout. When given,
 *  the UI never waits for (or depends on) the session request: with the
 *  flag off the caller is an operator outright, and with it on the
 *  server-verified answer stands. */
export function ConsoleSessionProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: ConsoleSession;
}) {
  const q = useConsoleSession(initial);
  const access =
    initial && !initial.publicMode
      ? FLAG_OFF
      : accessFrom(q.data, {
          isPending: q.isPending,
          // Keep a good answer through a failed background refetch.
          isError: q.isError && q.data === undefined,
        });
  return (
    <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
  );
}

/** Test/override hook point: fix the access value for a subtree. */
export function OperatorAccessProvider({
  value,
  children,
}: {
  value: OperatorAccess;
  children: ReactNode;
}) {
  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}

export function useOperatorAccess(): OperatorAccess {
  return useContext(AccessContext);
}

/** Thrown by an admin mutation started without an operator session. No
 *  request is sent. */
export class OperatorRequiredError extends Error {
  constructor() {
    super('Operator only — sign in to do this.');
  }
}

/** Guard for admin mutation functions: refuse before any request. */
export function requireOperator(access: OperatorAccess): void {
  if (!access.canAdmin) throw new OperatorRequiredError();
}

/** `useMutation` for an admin route: the mutation refuses with
 *  `OperatorRequiredError`, sending nothing, unless the caller is known to
 *  be an operator. The buttons that start these are hidden or disabled for
 *  anonymous visitors too; this is the backstop. */
export function useAdminMutation<TData, TVariables = void>(
  options: UseMutationOptions<TData, Error, TVariables> & {
    mutationFn: (variables: TVariables) => Promise<TData>;
  },
) {
  const access = useOperatorAccess();
  const { mutationFn } = options;
  return useMutation<TData, Error, TVariables>({
    ...options,
    mutationFn: async (variables) => {
      requireOperator(access);
      return mutationFn(variables);
    },
  });
}
