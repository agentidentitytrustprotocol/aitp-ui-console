import { Card } from '@/components/shared/card';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { C } from '@/lib/colors';

const COPY: Record<string, string> = {
  intra_org:
    'All agents in the same deployment. Trust anchors known upfront. Manifests served from the same control surface.',
  cross_org:
    'External agent discovered via the CP registry. Manifest fetched and verified against the issuer manifest before handshake.',
  cross_cloud:
    'Agents resolved via did:web. Each agent serves its own DID document. No central registry required for discovery.',
};

export function TrustExplainer({ boundary }: { boundary: string | undefined }) {
  if (!boundary) return null;
  return (
    <Card style={{ padding: 18, height: 'fit-content' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: C.textDim,
          marginBottom: 10,
          letterSpacing: '0.06em',
        }}
      >
        TRUST BOUNDARY <BoundaryBadge boundary={boundary} />
      </div>
      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>
        {COPY[boundary] ?? 'Boundary-specific guidance not available.'}
      </div>
    </Card>
  );
}
