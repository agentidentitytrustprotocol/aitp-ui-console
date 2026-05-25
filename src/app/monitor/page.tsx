'use client';

import { Radio } from 'lucide-react';
import { SectionTitle } from '@/components/shared/card';
import { EventTicker } from '@/components/monitor/event-ticker';

export default function MonitorPage() {
  return (
    <div className="anim-in">
      <SectionTitle icon={Radio} title="Live Monitor" sub="Real-time AITP protocol events from the control plane" />
      <div style={{ height: 'calc(100vh - 180px)' }}>
        <EventTicker />
      </div>
    </div>
  );
}
