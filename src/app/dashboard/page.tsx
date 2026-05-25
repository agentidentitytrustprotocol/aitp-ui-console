'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Cpu,
  LayoutDashboard,
  ShieldCheck,
  Webhook,
  Zap,
} from 'lucide-react';
import { Card, SectionTitle } from '@/components/shared/card';
import { KPICard } from '@/components/dashboard/kpi-card';
import { HandshakesChart } from '@/components/dashboard/handshakes-chart';
import { BoundaryPie } from '@/components/dashboard/boundary-pie';
import { CapabilitiesBar } from '@/components/dashboard/capabilities-bar';
import { AgentActivity } from '@/components/dashboard/agent-activity';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useDashboard } from '@/hooks/use-dashboard';
import type { Range } from '@/lib/types/cp';
import { C } from '@/lib/colors';

const RANGES: Range[] = ['1h', '24h', '7d', '30d'];

export default function DashboardPage() {
  const [range, setRange] = useState<Range>('24h');
  const { data, isLoading, error } = useDashboard(range);

  const kpis = data?.kpis;
  const successRate =
    kpis && kpis.handshakesInRange > 0
      ? `${((kpis.handshakesSuccessInRange / kpis.handshakesInRange) * 100).toFixed(1)}%`
      : '—';

  return (
    <div className="anim-in">
      <SectionTitle
        icon={LayoutDashboard}
        title="Dashboard"
        sub="AITP ecosystem overview"
        right={
          <div
            style={{
              display: 'flex',
              gap: 2,
              background: C.bg3,
              padding: 3,
              borderRadius: 6,
              border: `1px solid ${C.border}`,
            }}
          >
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  background: range === r ? C.teal : 'transparent',
                  color: range === r ? '#fff' : C.textDim,
                }}
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <Card style={{ padding: 16, marginBottom: 20, borderLeft: `3px solid ${C.red}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.red, fontSize: 13 }}>
            <AlertTriangle size={14} />
            Failed to load dashboard. Check Control Plane connection in Config.
          </div>
        </Card>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <KPICard
          label="Agents"
          value={kpis?.agentsRegistered ?? '—'}
          sub="registered"
          icon={Cpu}
          color={C.teal}
        />
        <KPICard
          label="Handshakes"
          value={kpis?.handshakesInRange ?? '—'}
          sub={`in ${range}`}
          icon={ShieldCheck}
          color={C.blue}
        />
        <KPICard label="Success Rate" value={successRate} sub={`in ${range}`} icon={CheckCircle} color={C.green} />
        <KPICard
          label="Invocations"
          value={kpis?.capabilityInvocationsInRange ?? '—'}
          sub={`capabilities in ${range}`}
          icon={Zap}
          color={C.amber}
        />
        <KPICard
          label="Sessions"
          value={kpis?.activeSessions ?? '—'}
          sub="active now"
          icon={Activity}
          color={C.purple}
        />
        <KPICard
          label="Webhooks"
          value={kpis?.pendingWebhookDeliveries ?? '—'}
          sub="pending"
          icon={Webhook}
          color={C.textDim}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 16 }}>
            Handshakes over time
          </div>
          {isLoading ? (
            <LoadingSkeleton rows={1} height={180} />
          ) : (data?.charts.handshakesOverTime?.length ?? 0) > 0 ? (
            <HandshakesChart data={data!.charts.handshakesOverTime} />
          ) : (
            <EmptyState title="No handshake data" description="Run a scenario to populate this chart." />
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 16 }}>
            By trust boundary
          </div>
          {isLoading ? (
            <LoadingSkeleton rows={1} height={180} />
          ) : (
            <BoundaryPie data={data?.charts.handshakesByBoundary ?? []} />
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 16 }}>
            Top capabilities
          </div>
          {isLoading ? (
            <LoadingSkeleton rows={1} height={180} />
          ) : (data?.charts.topCapabilities?.length ?? 0) > 0 ? (
            <CapabilitiesBar data={data!.charts.topCapabilities} />
          ) : (
            <EmptyState title="No invocations" />
          )}
        </Card>
      </div>

      <AgentActivity />
    </div>
  );
}
