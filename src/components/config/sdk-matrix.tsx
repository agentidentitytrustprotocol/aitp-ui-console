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
        {data?.sdk_version && (
          <span className="mono" style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>
            aitp v{data.sdk_version}
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
          {Object.entries(data.features).map(([feature, enabled]) => (
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
              {enabled ? <Check size={12} color={C.green} /> : <X size={12} color={C.red} />}
              <span className="mono" style={{ fontSize: 11, color: enabled ? C.text : C.textMuted }}>
                {feature}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
