import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { C } from '@/lib/colors';

export const metadata: Metadata = {
  title: 'AITP Console',
  description: 'Monitoring and control plane for the AITP ecosystem',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <Providers>
          <div
            style={{
              display: 'flex',
              height: '100vh',
              background: C.bg0,
              color: C.text,
              overflow: 'hidden',
            }}
          >
            <Sidebar />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Topbar />
              <main id="main" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                {/* Suspense boundary required by Next 15 for any consumer
                    of useSearchParams (e.g. our useUrlState hook). One
                    boundary at the layout level covers every page. */}
                <Suspense>{children}</Suspense>
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
