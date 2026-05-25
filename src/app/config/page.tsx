'use client';

import { Settings } from 'lucide-react';
import { SectionTitle } from '@/components/shared/card';
import { ConnectionPanel } from '@/components/config/connection-panel';
import { CpIdentityCard } from '@/components/config/cp-identity';
import { WebhookList } from '@/components/config/webhook-list';

export default function ConfigPage() {
  return (
    <div className="anim-in">
      <SectionTitle icon={Settings} title="Config" sub="Service connections and system settings" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ConnectionPanel />
          <WebhookList />
        </div>
        <CpIdentityCard />
      </div>
    </div>
  );
}
