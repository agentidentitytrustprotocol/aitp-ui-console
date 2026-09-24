import { cn, formatAid, formatGrants, formatOffset, runOffsetMs, shortId, timeAgo } from './utils';

describe('cn', () => {
  it('joins classnames and de-duplicates Tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red', false, undefined, 'font-bold')).toBe('text-red font-bold');
  });
});

describe('runOffsetMs', () => {
  // Real frames from one playground run (`run-7f3c`), captured off the SSE
  // stream. Both channels stamp `time.time()`, so both are epoch SECONDS.
  const firstEvent = 1790199933.127181;

  it('converts an epoch-second pair to a millisecond offset', () => {
    expect(runOffsetMs(1790199933.21171, firstEvent)).toBeCloseTo(84.529, 3);
    expect(runOffsetMs(1790200010.383384, firstEvent)).toBeCloseTo(77256.203, 3);
  });

  it('is zero for the base event itself', () => {
    expect(runOffsetMs(firstEvent, firstEvent)).toBe(0);
  });

  it('returns a negative offset rather than an absolute one when clocks skew', () => {
    // The agent subprocesses stamp in their own processes, so an agent event
    // can land fractionally before the orchestrator's first event.
    // Precision 3, not more: subtracting two ~1.79e9 doubles leaves ~1e-4 ms
    // of float noise, which is why the UI rounds the sub-second branch.
    expect(runOffsetMs(firstEvent - 0.012, firstEvent)).toBeCloseTo(-12, 3);
  });

  it('does not apply a magnitude heuristic to the inputs', () => {
    // `timeAgo` scales a bare `< 1e12` value by 1000 because it renders one
    // absolute instant as a date. Offsets must not: doing so would mis-scale
    // any run longer than ~11.5 days of offset and would hide the unit
    // question rather than answer it.
    expect(runOffsetMs(2, 1)).toBe(1_000);
  });
});

describe('formatOffset', () => {
  // Exported here (moved from `event-cards.tsx`) once `run-deliveries.tsx`
  // needed the exact same rendering for its "When" column — see
  // `event-cards.test.tsx`'s "formatOffset (via the rendered timestamp)" for
  // the original, still-passing render-level pins of this same behaviour.
  it.each([
    [0, '+0ms'],
    [999, '+999ms'],
    [1_000, '+1.0s'],
    [59_999, '+60.0s'],
    [60_000, '+1.0m'],
    [-12, '-12ms'],
    [-1_500, '-1.5s'],
    [-90_000, '-1.5m'],
  ])('formats %dms as %s', (ms, expected) => {
    expect(formatOffset(ms)).toBe(expected);
  });

  it('rounds sub-second float noise rather than truncating it', () => {
    expect(formatOffset(294.31100010871887)).toBe('+294ms');
  });
});

describe('formatAid', () => {
  const aid = 'aid:pubkey:A7mK9xP2nR4vQ8sL3tW6uY1jC5bE0fH';

  it('returns "" for falsy input', () => {
    expect(formatAid(null)).toBe('');
    expect(formatAid(undefined)).toBe('');
  });

  it('truncates to head + ellipsis + tail by default', () => {
    expect(formatAid(aid)).toBe('A7mK9xP2…E0fH');
  });

  it('strips the aid:pubkey: prefix before truncating', () => {
    expect(formatAid(aid).startsWith('A7mK')).toBe(true);
  });

  it('returns the original aid if it would not benefit from truncation', () => {
    expect(formatAid('aid:pubkey:short')).toBe('aid:pubkey:short');
  });
});

describe('formatGrants', () => {
  it('returns the empty-set glyph when no grants', () => {
    expect(formatGrants([])).toBe('∅');
    expect(formatGrants(null)).toBe('∅');
    expect(formatGrants(undefined)).toBe('∅');
  });

  it('joins grants with commas', () => {
    expect(formatGrants(['read', 'write'])).toBe('read, write');
  });
});

describe('shortId', () => {
  it('returns "" for falsy input', () => {
    expect(shortId(null)).toBe('');
    expect(shortId('')).toBe('');
  });

  it('truncates to len with an ellipsis when longer', () => {
    expect(shortId('550e8400-e29b-41d4', 8)).toBe('550e8400…');
  });

  it('returns the original when shorter than len', () => {
    expect(shortId('abc', 8)).toBe('abc');
  });
});

describe('timeAgo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('returns dash for empty input', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo(undefined)).toBe('—');
  });

  it('interprets numeric epoch seconds and milliseconds', () => {
    const epochSec = Math.floor(new Date('2026-05-24T11:59:50Z').getTime() / 1000);
    expect(timeAgo(epochSec)).toBe('10s ago');
    expect(timeAgo(new Date('2026-05-24T11:59:50Z').getTime())).toBe('10s ago');
  });

  it('formats seconds / minutes / hours / days', () => {
    expect(timeAgo(new Date('2026-05-24T11:59:55Z'))).toBe('5s ago');
    expect(timeAgo(new Date('2026-05-24T11:30:00Z'))).toBe('30m ago');
    expect(timeAgo(new Date('2026-05-24T08:00:00Z'))).toBe('4h ago');
    expect(timeAgo(new Date('2026-05-22T12:00:00Z'))).toBe('2d ago');
  });

  it('falls back to a date string after 30 days', () => {
    const out = timeAgo(new Date('2026-04-01T12:00:00Z'));
    expect(out).toMatch(/2026/);
  });

  it('treats future timestamps as just-now', () => {
    expect(timeAgo(new Date('2026-05-24T13:00:00Z'))).toBe('just now');
  });
});
