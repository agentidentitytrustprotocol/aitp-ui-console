'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/shared/toast';
import {
  ConsoleSessionProvider,
  type ConsoleSession,
} from '@/hooks/use-console-session';

export function Providers({
  children,
  initialSession,
}: {
  children: ReactNode;
  /** The session as the server saw it while rendering the layout. */
  initialSession?: ConsoleSession;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ConsoleSessionProvider initial={initialSession}>
        <ToastProvider>{children}</ToastProvider>
      </ConsoleSessionProvider>
    </QueryClientProvider>
  );
}
