'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { SectionTitle } from '@/components/shared/card';
import { TabBar } from '@/components/shared/tab-bar';
import { TrustAnchorsView } from '@/components/trust/trust-anchors';
import { PinnedKeysView } from '@/components/trust/pinned-keys';
import { RevocationView } from '@/components/trust/revocation';

type TrustTab = 'anchors' | 'pinned' | 'revocation';

export default function TrustPage() {
  const [tab, setTab] = useState<TrustTab>('anchors');
  return (
    <div className="anim-in">
      <SectionTitle
        icon={ShieldCheck}
        title="Trust"
        sub="Trust anchors, pinned keys, and revocation"
      />
      <TabBar<TrustTab>
        tabs={[
          { id: 'anchors', label: 'Trust anchors' },
          { id: 'pinned', label: 'Pinned keys' },
          { id: 'revocation', label: 'Revocation' },
        ]}
        current={tab}
        onChange={setTab}
      />
      {tab === 'anchors' && <TrustAnchorsView />}
      {tab === 'pinned' && <PinnedKeysView />}
      {tab === 'revocation' && <RevocationView />}
    </div>
  );
}
