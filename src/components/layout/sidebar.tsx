'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  LayoutDashboard,
  Layers,
  List,
  Radio,
  Settings,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { C } from '@/lib/colors';
import { useRunCount } from '@/hooks/use-runs';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  showBadge?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/scenarios', label: 'Scenarios', icon: BookOpen },
  { href: '/runs', label: 'Runs', icon: List, showBadge: true },
  { href: '/monitor', label: 'Monitor', icon: Radio },
  { href: '/registry', label: 'Registry', icon: Layers },
  { href: '/config', label: 'Config', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const runBadge = useRunCount();

  return (
    <aside
      style={{
        width: 200,
        background: C.bg1,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div style={{ padding: '20px 18px 16px', borderBottom: `1px solid ${C.border}` }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: C.teal,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '0.02em' }}>
              AITP
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.04em' }}>CONSOLE</div>
          </div>
        </Link>
      </div>

      <nav style={{ flex: 1, padding: '10px 8px' }}>
        {NAV.map((item) => {
          const active =
            pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 10px',
                borderRadius: 7,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                background: active ? C.teal + '18' : 'transparent',
                color: active ? C.tealBright : C.textDim,
                borderLeft: active ? `2px solid ${C.teal}` : '2px solid transparent',
                marginBottom: 2,
                transition: 'all .15s',
              }}
            >
              <item.icon size={15} />
              <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              {item.showBadge && runBadge > 0 && (
                <span
                  style={{
                    background: C.blue,
                    color: '#fff',
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 600,
                  }}
                >
                  {runBadge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}` }}>
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            letterSpacing: '0.05em',
            marginBottom: 8,
          }}
        >
          VERSION
        </div>
        <div style={{ fontSize: 11, color: C.textDim }}>
          aitp-console <span className="mono" style={{ color: C.teal }}>v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
