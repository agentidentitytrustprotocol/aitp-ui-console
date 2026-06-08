'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from './card';
import { C } from '@/lib/colors';

interface SectionErrorProps {
  /** Section label shown in the heading. */
  section?: string;
  error: Error & { digest?: string };
  reset: () => void;
}

export function SectionError({ section, error, reset }: SectionErrorProps) {
  useEffect(() => {
    // Visible in the browser console + any error sink the host wires up.
    console.error('[section-error]', section ?? 'unknown', error);
  }, [error, section]);

  return (
    <Card style={{ padding: 24, maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AlertTriangle size={16} color={C.red} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {section ? `${section} crashed` : 'This section crashed'}
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 14, lineHeight: 1.5 }}>
        The rest of the console is still usable — pick another section in the sidebar, or try again
        once the upstream is healthy.
      </div>
      <details style={{ marginBottom: 14 }}>
        <summary
          style={{
            fontSize: 11,
            color: C.textMuted,
            cursor: 'pointer',
            marginBottom: 6,
          }}
        >
          Error detail
        </summary>
        <pre
          style={{
            background: C.bg3,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            padding: 10,
            fontSize: 11,
            color: C.textDim,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
          }}
        >
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ''}
        </pre>
      </details>
      <button
        onClick={reset}
        style={{
          background: C.teal,
          border: 'none',
          color: '#fff',
          fontSize: 12,
          padding: '7px 14px',
          borderRadius: 5,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <RefreshCw size={12} /> Try again
      </button>
    </Card>
  );
}
