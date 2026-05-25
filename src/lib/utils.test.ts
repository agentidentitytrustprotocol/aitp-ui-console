import { cn, formatAid, formatGrants, shortId, timeAgo } from './utils';

describe('cn', () => {
  it('joins classnames and de-duplicates Tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red', false, undefined, 'font-bold')).toBe('text-red font-bold');
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
