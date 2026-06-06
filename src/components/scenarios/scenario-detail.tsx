'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { BoundaryBadge } from '@/components/shared/boundary-badge';
import { CapabilityBadge, Tag } from '@/components/shared/capability-badge';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { RunInputForm } from './run-input-form';
import { TrustExplainer } from './trust-explainer';
import { useScenario } from '@/hooks/use-scenarios';
import { postJSON } from '@/lib/api/client';
import { C } from '@/lib/colors';
import type { RunCreated, RunCreateInput } from '@/lib/types/playground';

export function ScenarioDetail({ ref: scenarioRef }: { ref: string }) {
  const router = useRouter();
  const { data, isLoading, error } = useScenario(scenarioRef);

  const trigger = useMutation({
    mutationFn: (body: Omit<RunCreateInput, 'scenario_ref'>) =>
      postJSON<RunCreated>('/api/playground/runs', {
        scenario_ref: scenarioRef,
        ...body,
      }),
    onSuccess: (run) => router.push(`/runs/${encodeURIComponent(run.run_id)}`),
  });

  return (
    <div className="anim-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Link
          href="/scenarios"
          style={{ color: C.textDim, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
        >
          <ArrowLeft size={14} /> Scenarios
        </Link>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : error || !data ? (
        <Card style={{ padding: 20 }}>
          <EmptyState title="Scenario not found" description={scenarioRef} />
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{data.metadata.name}</div>
            <BoundaryBadge boundary={data.spec.trust.boundary} />
            <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>
              v{data.metadata.version}
            </span>
          </div>
          {data.metadata.summary && (
            <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.7, marginBottom: 20 }}>
              {data.metadata.summary}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px 280px', gap: 16 }}>
            <div>
              <SectionLabel>Agents</SectionLabel>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {data.spec.agents.map((a) => (
                  <Card key={a.id} style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green }} />
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{a.id}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted }} className="mono">
                      {a.ref}
                    </div>
                    {(a.org || a.cloud) && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                        {a.org && <Tag>{a.org}</Tag>}
                        {a.cloud && <Tag>{a.cloud}</Tag>}
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              <SectionLabel>Workflow</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.spec.workflow.steps.map((step, i, arr) => (
                  <div
                    key={step.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '12px 14px',
                      background: C.bg3,
                      borderRadius:
                        i === 0
                          ? '6px 6px 0 0'
                          : i === arr.length - 1
                          ? '0 0 6px 6px'
                          : 0,
                      borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${C.border}30`,
                    }}
                  >
                    <div className="mono" style={{ fontSize: 11, color: C.teal, minWidth: 24 }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>
                        {step.description ?? step.id}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {step.type && <Tag>{step.type}</Tag>}
                        {step.capability && <CapabilityBadge cap={step.capability} />}
                        {step.agent && (
                          <span style={{ fontSize: 11, color: C.textMuted }}>on {step.agent}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <SectionLabel style={{ marginTop: 20 }}>Tags</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(data.metadata.tags ?? []).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </div>

            <Card style={{ padding: 20, height: 'fit-content' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>
                Run inputs
              </div>
              {trigger.error && (
                <div
                  style={{
                    background: C.red + '15',
                    border: `1px solid ${C.red}40`,
                    color: C.red,
                    padding: 10,
                    borderRadius: 6,
                    fontSize: 11,
                    marginBottom: 12,
                  }}
                >
                  {String(trigger.error)}
                </div>
              )}
              <RunInputForm
                schema={data.spec.inputs.schema}
                templates={data.spec.templates}
                agents={data.spec.agents}
                loading={trigger.isPending}
                onSubmit={(submission) => trigger.mutate(submission)}
              />
            </Card>

            <TrustExplainer boundary={data.spec.trust.boundary} />
          </div>
        </>
      )}
    </div>
  );
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: C.textDim,
        marginBottom: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
