'use client';

import { Settings } from 'lucide-react';
import { SectionTitle } from '@/components/shared/card';
import { ConnectionPanel } from '@/components/config/connection-panel';
import { CpIdentityCard } from '@/components/config/cp-identity';
import { WebhookList } from '@/components/config/webhook-list';
import { SdkMatrix } from '@/components/config/sdk-matrix';
import { ProcessList } from '@/components/config/process-list';
import { MetricsPanel } from '@/components/config/metrics-panel';

export default function ConfigPage() {
  return (
    <div className="anim-in">
      <SectionTitle icon={Settings} title="Config" sub="Service connections and system settings" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ConnectionPanel />
          <SdkMatrix />
          <ProcessList />
          <WebhookList />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CpIdentityCard />
          <MetricsPanel source="playground" />
          <MetricsPanel source="cp" />
        </div>
      </div>
    </div>
  );
}
