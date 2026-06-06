'use client';

import { Boxes, Check, X } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { usePlaygroundCapabilities } from '@/hooks/use-playground-meta';
import { C } from '@/lib/colors';

export function SdkMatrix() {
  const { data, isLoading, error } = usePlaygroundCapabilities();

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Boxes size={14} color={C.teal} /> Playground SDK capabilities
        {data && (
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: data.sdk_available ? C.tealBright : C.amber,
              marginLeft: 'auto',
              background: data.sdk_available ? C.teal + '15' : C.amber + '15',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            {data.sdk_available
              ? data.version
                ? `aitp v${data.version}`
                : 'aitp installed'
              : 'SDK not detected'}
          </span>
        )}
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : error || !data ? (
        <EmptyState
          title="Capabilities unavailable"
          description="The playground didn't expose /capabilities."
        />
      ) : Object.keys(data.features).length === 0 ? (
        <EmptyState title="No features reported" description="SDK reported an empty feature map." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 6,
          }}
        >
          {Object.entries(data.features).map(([feature, enabled]) => {
            const on = !!enabled;
            return (
              <div
                key={feature}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  background: C.bg3,
                  border: `1px solid ${C.border}`,
                  borderRadius: 5,
                }}
              >
                {on ? <Check size={12} color={C.green} /> : <X size={12} color={C.red} />}
                <span className="mono" style={{ fontSize: 11, color: on ? C.text : C.textMuted }}>
                  {feature}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
