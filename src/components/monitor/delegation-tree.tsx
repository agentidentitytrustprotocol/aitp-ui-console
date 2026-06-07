'use client';

import { useMemo, useState } from 'react';
import { Ban, ChevronRight } from 'lucide-react';
import { Card } from '@/components/shared/card';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingSkeleton } from '@/components/shared/loading-skeleton';
import { AidCell } from '@/components/shared/aid-cell';
import { CapabilityBadge } from '@/components/shared/capability-badge';
import { useCreateRevocation, useDelegations } from '@/hooks/use-trust';
import { C } from '@/lib/colors';
import { shortId } from '@/lib/utils';
import type { Delegation, DelegationNode } from '@/lib/types/cp';

interface TreeBuild {
  roots: DelegationNode[];
  orphans: DelegationNode[];
}

/** Build the delegation tree from a flat list.
 *
 *  Two safety properties beyond the obvious parent-child wiring:
 *  - Orphans: rows whose `parentJti` points to a row not in the
 *    result window are bucketed separately rather than silently
 *    promoted to roots.
 *  - Cycle guard: each child is attached at most once via a visited
 *    set, so a malformed dataset can't cause infinite recursion. */
function buildTree(rows: Delegation[]): TreeBuild {
  const byJti = new Map<string, DelegationNode>();
  for (const d of rows) byJti.set(d.jti, { ...d, children: [] });

  const visited = new Set<string>();
  const roots: DelegationNode[] = [];
  const orphans: DelegationNode[] = [];

  for (const node of byJti.values()) {
    if (visited.has(node.jti)) {
      node.cycle = true;
      continue;
    }
    if (!node.parentJti) {
      roots.push(node);
      visited.add(node.jti);
      continue;
    }
    const parent = byJti.get(node.parentJti);
    if (!parent) {
      node.orphan = true;
      orphans.push(node);
      visited.add(node.jti);
      continue;
    }
    if (visited.has(node.jti)) continue;
    parent.children!.push(node);
    visited.add(node.jti);
  }

  return { roots, orphans };
}

export function DelegationTree() {
  const { data, isLoading, error } = useDelegations();
  const [selected, setSelected] = useState<DelegationNode | null>(null);
  const revoke = useCreateRevocation();
  const [confirming, setConfirming] = useState(false);

  const { roots, orphans } = useMemo(
    () => buildTree(data?.delegations ?? []),
    [data?.delegations],
  );

  if (isLoading) return <LoadingSkeleton rows={6} />;
  if (error) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState title="Couldn't load delegations" description="Check the Control Plane connection." />
      </Card>
    );
  }
  if (roots.length === 0 && orphans.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState
          title="No delegation chains"
          description="When TCT holders delegate downstream, the chains show up here."
        />
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
      <Card style={{ padding: 14, overflow: 'auto' }}>
        {roots.map((root) => (
          <TreeNode
            key={root.jti}
            node={root}
            depth={0}
            selectedJti={selected?.jti ?? null}
            onSelect={setSelected}
          />
        ))}
        {orphans.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div
              style={{
                fontSize: 10,
                color: C.amber,
                fontWeight: 600,
                letterSpacing: '0.06em',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}
            >
              Orphaned · {orphans.length} (parent outside result window)
            </div>
            {orphans.map((o) => (
              <TreeNode
                key={o.jti}
                node={o}
                depth={0}
                selectedJti={selected?.jti ?? null}
                onSelect={setSelected}
              />
            ))}
          </div>
        )}
      </Card>
      <Card style={{ padding: 16, height: 'fit-content' }}>
        {selected ? (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 10 }}>
              Delegation detail
            </div>
            <Detail label="JTI">
              <span className="mono" style={{ fontSize: 11, color: C.teal, wordBreak: 'break-all' }}>
                {selected.jti}
              </span>
            </Detail>
            {selected.parentJti && (
              <Detail label="Parent">
                <span className="mono" style={{ fontSize: 11, color: C.textDim, wordBreak: 'break-all' }}>
                  {selected.parentJti}
                </span>
                {selected.orphan && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 9,
                      color: C.amber,
                      background: C.amber + '15',
                      padding: '1px 5px',
                      borderRadius: 3,
                      marginLeft: 6,
                    }}
                  >
                    not in result window
                  </span>
                )}
              </Detail>
            )}
            <Detail label="Delegator">
              <AidCell aid={selected.delegator} />
            </Detail>
            <Detail label="Delegatee">
              <AidCell aid={selected.delegatee} />
            </Detail>
            <Detail label="Scope">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {(selected.scope ?? []).map((s) => (
                  <CapabilityBadge key={s} cap={s} />
                ))}
                {(selected.scope ?? []).length === 0 && (
                  <span style={{ fontSize: 11, color: C.textMuted }}>none</span>
                )}
              </div>
            </Detail>
            <Detail label="Status">
              <span
                style={{
                  fontSize: 11,
                  color: selected.revoked ? C.red : C.green,
                  fontWeight: 500,
                }}
              >
                {selected.revoked ? 'revoked' : 'active'}
              </span>
            </Detail>
            {!selected.revoked &&
              (confirming ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>
                    Revoking this jti propagates to its descendants.
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setConfirming(false)}
                      style={{
                        flex: 1,
                        background: 'none',
                        border: `1px solid ${C.border}`,
                        borderRadius: 5,
                        padding: '6px 10px',
                        color: C.textDim,
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() =>
                        revoke.mutate(
                          { jti: selected.jti, reason: 'admin-revoke-from-console' },
                          {
                            onSuccess: () => {
                              setConfirming(false);
                              setSelected(null);
                            },
                          },
                        )
                      }
                      disabled={revoke.isPending}
                      style={{
                        flex: 1,
                        background: C.red,
                        border: 'none',
                        borderRadius: 5,
                        padding: '6px 10px',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Yes, revoke
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    background: C.red + '15',
                    border: `1px solid ${C.red}40`,
                    color: C.red,
                    borderRadius: 5,
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Ban size={12} /> Revoke this jti
                </button>
              ))}
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', padding: 20 }}>
            Click a delegation in the tree to inspect.
          </div>
        )}
      </Card>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedJti,
  onSelect,
}: {
  node: DelegationNode;
  depth: number;
  selectedJti: string | null;
  onSelect: (n: DelegationNode) => void;
}) {
  const selected = selectedJti === node.jti;
  return (
    <div>
      <div
        onClick={() => onSelect(node)}
        style={{
          padding: '6px 10px',
          marginLeft: depth * 18,
          background: selected ? C.bg3 : 'transparent',
          borderRadius: 5,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: node.revoked ? C.red : C.text,
          borderLeft: selected ? `2px solid ${C.teal}` : '2px solid transparent',
        }}
      >
        <ChevronRight
          size={10}
          color={node.children?.length ? C.textDim : C.textMuted}
          style={{ opacity: node.children?.length ? 1 : 0 }}
        />
        <span className="mono" style={{ color: node.revoked ? C.red : C.teal }}>
          {shortId(node.jti, 14)}
        </span>
        <span style={{ color: C.textMuted }}>→</span>
        <span style={{ color: C.textDim, fontSize: 11 }}>{shortId(node.delegatee, 16)}</span>
        {node.orphan && (
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: C.amber,
              background: C.amber + '15',
              padding: '0 5px',
              borderRadius: 3,
              marginLeft: 'auto',
            }}
          >
            orphan
          </span>
        )}
        {node.revoked && (
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: C.red,
              background: C.red + '20',
              padding: '0 5px',
              borderRadius: 3,
              marginLeft: node.orphan ? 6 : 'auto',
            }}
          >
            revoked
          </span>
        )}
      </div>
      {node.children?.map((c) => (
        <TreeNode key={c.jti} node={c} depth={depth + 1} selectedJti={selectedJti} onSelect={onSelect} />
      ))}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}
