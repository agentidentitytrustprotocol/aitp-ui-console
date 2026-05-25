import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function Wrap({ children, client }: { children: ReactNode; client: QueryClient }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export interface RenderWithClientResult extends RenderResult {
  client: QueryClient;
}

export function renderWithClient(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { client?: QueryClient },
): RenderWithClientResult {
  const client = options?.client ?? makeClient();
  const utils = render(ui, {
    wrapper: ({ children }) => <Wrap client={client}>{children}</Wrap>,
    ...options,
  });
  return { ...utils, client };
}
