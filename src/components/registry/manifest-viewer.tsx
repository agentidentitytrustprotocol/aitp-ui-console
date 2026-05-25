'use client';

import { Card } from '@/components/shared/card';
import { JsonTree } from '@/components/shared/json-tree';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useAgentManifest } from '@/hooks/use-registry';
import { C } from '@/lib/colors';

const HIGHLIGHTS: Record<string, string> = {
  aid: C.tealBright,
  handshake_endpoint: C.blue,
  offered_capabilities: C.amber,
  expires_at: C.blue,
  signature: C.textMuted,
  proof_of_possession: C.textMuted,
};

function highlight(path: string[]): string | null {
  const last = path[path.length - 1];
  return HIGHLIGHTS[last] ?? null;
}

export function ManifestViewer({ aid }: { aid: string }) {
  const { data, isLoading, error } = useAgentManifest(aid);

  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 14 }}>
        Manifest
      </div>
      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : error || !data ? (
        <EmptyState title="No manifest available" description="The agent may have been deregistered." />
      ) : (
        <div
          style={{
            background: C.bg3,
            padding: 14,
            borderRadius: 6,
            maxHeight: 360,
            overflow: 'auto',
          }}
        >
          <JsonTree value={data} highlight={highlight} />
        </div>
      )}
    </Card>
  );
}
