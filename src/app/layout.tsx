import type { Metadata } from 'next';
import type { ReactNode } from 'react';
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
              <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children}</div>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
