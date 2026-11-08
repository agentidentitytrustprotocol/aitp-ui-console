/** @jest-environment node */
import { clientIp, normalizeIp, rateLimitKey } from './client-ip';

const VERCEL = { VERCEL: '1' };
const h = (o: Record<string, string>) => new Headers(o);

describe('normalizeIp', () => {
  it.each([
    ['1.2.3.4', '1.2.3.4'],
    [' 1.2.3.4 ', '1.2.3.4'],
    ['2001:DB8::1', '2001:db8::1'],
    ['[2001:db8::1]', '2001:db8::1'],
    ['fe80::1%eth0', 'fe80::1'],
    ['::ffff:1.2.3.4', '1.2.3.4'],
    ['::ffff:102:304', '1.2.3.4'],
    ['0:0:0:0:0:ffff:1.2.3.4', '1.2.3.4'],
  ])('%p → %p', (raw, want) => expect(normalizeIp(raw)).toBe(want));

  it.each([
    '',
    'not-an-ip',
    '1.2.3',
    '999.1.1.1',
    '[::1',
    '1.2.3.4:80',
    null,
    undefined,
  ])('rejects %p', (raw) => expect(normalizeIp(raw as string)).toBeNull());
});

describe('clientIp on Vercel', () => {
  it('prefers x-real-ip', () => {
    expect(
      clientIp(
        h({
          'x-real-ip': '9.9.9.9',
          'x-vercel-forwarded-for': '8.8.8.8',
          'x-forwarded-for': '7.7.7.7',
        }),
        VERCEL,
      ),
    ).toBe('9.9.9.9');
  });

  it('falls back to the first x-vercel-forwarded-for entry', () => {
    expect(
      clientIp(h({ 'x-vercel-forwarded-for': '8.8.8.8, 10.0.0.1' }), VERCEL),
    ).toBe('8.8.8.8');
  });

  it('ignores a spoofed leftmost x-forwarded-for and uses the rightmost', () => {
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 5.5.5.5' }), VERCEL)).toBe(
      '5.5.5.5',
    );
  });

  it('skips a malformed header and tries the next source', () => {
    expect(
      clientIp(
        h({ 'x-real-ip': 'garbage', 'x-forwarded-for': 'x, 4.4.4.4' }),
        VERCEL,
      ),
    ).toBe('4.4.4.4');
  });

  it('is unknown when nothing parses', () => {
    expect(clientIp(h({ 'x-real-ip': 'garbage' }), VERCEL)).toBe('unknown');
    expect(clientIp(h({}), VERCEL)).toBe('unknown');
  });
});

describe('clientIp off Vercel', () => {
  it('is unknown without CONSOLE_CLIENT_IP_HEADER, whatever the headers say', () => {
    expect(
      clientIp(h({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }), {}),
    ).toBe('unknown');
    // A missing VERCEL flag (not "1") is off-Vercel.
    expect(clientIp(h({ 'x-real-ip': '9.9.9.9' }), { VERCEL: '0' })).toBe(
      'unknown',
    );
  });

  it('trusts only the named header, rightmost entry', () => {
    const env = {
      CONSOLE_CLIENT_IP_HEADER: 'X-Client-IP',
    };
    expect(
      clientIp(
        h({ 'x-client-ip': '6.6.6.6, 3.3.3.3', 'x-real-ip': '9.9.9.9' }),
        env,
      ),
    ).toBe('3.3.3.3');
    expect(clientIp(h({ 'x-real-ip': '9.9.9.9' }), env)).toBe('unknown');
  });
});

describe('rateLimitKey', () => {
  it('keeps IPv4 as is and collapses IPv4-mapped to IPv4', () => {
    expect(rateLimitKey('1.2.3.4')).toBe('1.2.3.4');
    expect(rateLimitKey('::ffff:1.2.3.4')).toBe('1.2.3.4');
  });

  it('collapses IPv6 to its /64', () => {
    const a = rateLimitKey('2001:db8:1:2:aaaa::1');
    expect(a).toBe('2001:0db8:0001:0002::/64');
    expect(rateLimitKey('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(a);
    expect(rateLimitKey('2001:db8:1:3::1')).not.toBe(a);
    expect(rateLimitKey('::1')).toBe('0000:0000:0000:0000::/64');
    expect(rateLimitKey('2001:db8::')).toBe('2001:0db8:0000:0000::/64');
  });

  it('maps unknown and garbage to one shared bucket', () => {
    expect(rateLimitKey('unknown')).toBe('unknown');
    expect(rateLimitKey('nope')).toBe('unknown');
  });
});
