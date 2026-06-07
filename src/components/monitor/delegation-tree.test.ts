import { buildTree } from './delegation-tree';
import type { Delegation } from '@/lib/types/cp';

function row(jti: string, parentJti: string | null = null): Delegation {
  return {
    jti,
    parentJti,
    delegator: `aid:pubkey:${jti}-from`,
    delegatee: `aid:pubkey:${jti}-to`,
    scope: [],
    issuedAt: '2026-01-01T00:00:00Z',
    expiresAt: null,
    revoked: false,
  };
}

describe('buildTree', () => {
  it('wires children under their parents and roots the parentless rows', () => {
    const { roots, orphans } = buildTree([row('A'), row('B', 'A'), row('C', 'B')]);
    expect(orphans).toHaveLength(0);
    expect(roots).toHaveLength(1);
    expect(roots[0].jti).toBe('A');
    expect(roots[0].children?.[0].jti).toBe('B');
    expect(roots[0].children?.[0].children?.[0].jti).toBe('C');
  });

  it('buckets rows whose parent is missing from the window as orphans', () => {
    const { roots, orphans } = buildTree([row('A'), row('Z', 'NOT_IN_WINDOW')]);
    expect(roots.map((r) => r.jti)).toEqual(['A']);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].jti).toBe('Z');
    expect(orphans[0].orphan).toBe(true);
    expect(orphans[0].cycle).toBeUndefined();
  });

  it('detects a direct two-node cycle and refuses to attach either side', () => {
    // A→B→A — every candidate attachment walks the parent chain and finds
    // the target, so both nodes are flagged rather than wired into the tree.
    const { roots, orphans } = buildTree([row('A', 'B'), row('B', 'A')]);
    expect(roots).toHaveLength(0);
    expect(orphans).toHaveLength(2);
    expect(orphans.every((n) => n.cycle)).toBe(true);
  });

  it('detects self-parenting as a cycle', () => {
    const { roots, orphans } = buildTree([row('SELF', 'SELF')]);
    expect(roots).toHaveLength(0);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].cycle).toBe(true);
  });

  it('terminates on a three-node cycle', () => {
    // A→B→C→A — every candidate attachment finds the cycle and flags the
    // node. The function must return and surface all three under orphans.
    const out = buildTree([row('A', 'C'), row('B', 'A'), row('C', 'B')]);
    expect(out.roots).toHaveLength(0);
    expect(out.orphans).toHaveLength(3);
    expect(out.orphans.every((n) => n.cycle)).toBe(true);
  });
});
