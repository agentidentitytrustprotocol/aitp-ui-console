'use client';

import { useEffect, useState } from 'react';

/** True once this component has hydrated on the client. Always `false` on
 *  the server and on the client's first render -- both agree, so hydration
 *  never mismatches on this value itself.
 *
 *  Use it to gate anything derived from a source that can race hydration:
 *  a `useQuery` (or any other client-only fetch) that starts immediately
 *  on mount can resolve before hydration finishes, so the client's first
 *  render can already disagree with the server-rendered snapshot (SSR
 *  always renders the pre-fetch state). Render the same SSR-safe
 *  placeholder while `!useHydrated()`, then swap to the live value --
 *  see `ConnectionPanel`/`ServiceRow` for the pattern. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Not a derived-state anti-pattern: this flips exactly once, from the
    // fixed SSR-safe value to "hydration is done," and nothing else could
    // set it. That's the standard mount-detection idiom.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  return hydrated;
}
