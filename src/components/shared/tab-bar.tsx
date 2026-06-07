'use client';

import { C } from '@/lib/colors';

export interface Tab<T extends string = string> {
  id: T;
  label: string;
  count?: number | string | null;
}

interface Props<T extends string> {
  /** `id` must match the generic `T`, so a drift between the tabs
   *  array and `current` is a type error at the consumer. */
  tabs: ReadonlyArray<Tab<T>>;
  current: T;
  onChange: (id: T) => void;
}

export function TabBar<T extends string>({ tabs, current, onChange }: Props<T>) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 14,
      }}
    >
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              color: active ? C.tealBright : C.textDim,
              borderBottom: active ? `2px solid ${C.teal}` : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  background: active ? C.teal + '25' : C.bg3,
                  color: active ? C.tealBright : C.textMuted,
                  padding: '0 6px',
                  borderRadius: 8,
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
