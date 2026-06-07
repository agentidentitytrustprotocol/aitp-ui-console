'use client';

import { Radio } from 'lucide-react';
import { SectionTitle } from '@/components/shared/card';
import { TabBar } from '@/components/shared/tab-bar';
import { EventTicker } from '@/components/monitor/event-ticker';
import { DelegationTree } from '@/components/monitor/delegation-tree';
import { TctList } from '@/components/monitor/tct-list';
import { useUrlEnum } from '@/hooks/use-url-state';

type MonitorTab = 'events' | 'delegations' | 'tcts';
const MONITOR_TABS = ['events', 'delegations', 'tcts'] as const;

export default function MonitorPage() {
  const [tab, setTab] = useUrlEnum<MonitorTab>('tab', MONITOR_TABS, 'events');
  return (
    <div className="anim-in">
      <SectionTitle
        icon={Radio}
        title="Live Monitor"
        sub="Real-time AITP protocol events from the control plane"
      />
      <TabBar<MonitorTab>
        tabs={[
          { id: 'events', label: 'Events' },
          { id: 'delegations', label: 'Delegations' },
          { id: 'tcts', label: 'TCTs' },
        ]}
        current={tab}
        onChange={setTab}
      />
      {tab === 'events' && (
        <div style={{ height: 'calc(100vh - 220px)' }}>
          <EventTicker />
        </div>
      )}
      {tab === 'delegations' && <DelegationTree />}
      {tab === 'tcts' && <TctList />}
    </div>
  );
}
