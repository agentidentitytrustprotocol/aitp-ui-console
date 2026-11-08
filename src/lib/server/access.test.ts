/** @jest-environment node */
import { NextRequest } from 'next/server';
import {
  OPERATOR_BASIC,
  clearConsoleAuthEnv,
  setConsoleAuthEnv,
  TEST_SESSION_SECRET,
} from '@/test/operator';
import { SESSION_COOKIE, signSession } from '../auth/session';
import { authorizeUpstream, isOperator, rateLimited } from './access';
import { ALLOWLIST, type AllowEntry } from './allowlist';
import {
  createLimiter,
  createStreamGate,
  INSTANCE_KEY,
  type Limiter,
  type StreamGate,
} from './limits';

const BASE = {
  playground: 'http://localhost:8000',
  cp: 'http://localhost:4000',
};
const ON = {
  AITP_CONSOLE_PUBLIC_MODE: 'on',
  VERCEL: '1',
  CP_READ_API_KEY: 'cp-read',
};
const OFF = { AITP_CONSOLE_PUBLIC_MODE: 'off', VERCEL: '1' };

/** A concrete path for an allowlist template. */
function samplePath(template: string): string {
  return template.replace(/:\w+\*/g, 'pack/scenario@1').replace(/:\w+/g, 'x1');
}

function target(e: AllowEntry): string {
  return `${BASE[e.service]}${samplePath(e.template)}`;
}

function req(
  headers: Record<string, string> = {},
  ip = '203.0.113.7',
): NextRequest {
  return new NextRequest('https://console.example.com/api/x', {
    headers: { 'x-real-ip': ip, ...headers },
  });
}

const anon = () => req();
const operator = () => req({ authorization: OPERATOR_BASIC });

let limiter: Limiter;
let gate: StreamGate;

beforeEach(() => {
  setConsoleAuthEnv();
  limiter = createLimiter();
  gate = createStreamGate();
});

afterAll(clearConsoleAuthEnv);

async function decide(
  e: AllowEntry,
  r: NextRequest,
  env: Record<string, string>,
) {
  return authorizeUpstream(e.service, e.method, target(e), r, {
    limiter,
    gate,
    env,
  });
}

async function code(res: Response): Promise<string> {
  return ((await res.json()) as { code: string }).code;
}

const label = (e: AllowEntry) =>
  `${e.service} ${e.method} ${e.template} (${e.access})`;

describe.each(ALLOWLIST.map((e) => [label(e), e] as const))(
  '%s',
  (_name, e) => {
    it('flag off, anonymous → 401 unauthenticated', async () => {
      const d = await decide(e, anon(), OFF);
      expect(d.ok).toBe(false);
      if (d.ok) return;
      expect(d.response.status).toBe(401);
      expect(await code(d.response)).toBe('unauthenticated');
    });

    it('flag off, operator → allowed with the matched entry', async () => {
      const d = await decide(e, operator(), OFF);
      expect(d).toMatchObject({ ok: true, operator: true, entry: e });
    });

    it('flag on, operator → allowed', async () => {
      const d = await decide(e, operator(), ON);
      expect(d).toMatchObject({ ok: true, operator: true, entry: e });
      if (d.ok) d.release();
    });

    it(
      e.access === 'admin'
        ? 'flag on, anonymous → 403 CONSOLE_OPERATOR_SESSION_REQUIRED'
        : 'flag on, anonymous → allowed',
      async () => {
        const d = await decide(e, anon(), ON);
        if (e.access === 'admin') {
          expect(d.ok).toBe(false);
          if (d.ok) return;
          expect(d.response.status).toBe(403);
          expect(await code(d.response)).toBe(
            'CONSOLE_OPERATOR_SESSION_REQUIRED',
          );
        } else {
          expect(d).toMatchObject({ ok: true, operator: false, entry: e });
          if (d.ok) d.release();
        }
      },
    );
  },
);

const runsLaunch = ALLOWLIST.find((e) => e.limit === 'launch')!;
const publicRead = ALLOWLIST.find(
  (e) => e.service === 'playground' && e.template === '/agents',
)!;
const cpRead = ALLOWLIST.find(
  (e) => e.service === 'cp' && e.cpKey === 'read' && e.limit === 'read',
)!;
const stream = ALLOWLIST.find(
  (e) => e.limit === 'stream' && e.access === 'public',
)!;
const cpStream = ALLOWLIST.find(
  (e) => e.service === 'cp' && e.limit === 'stream',
)!;
const adminEntry = ALLOWLIST.find((e) => e.access === 'admin')!;

describe('flag off', () => {
  it('never touches the limiter or the stream gate', async () => {
    const consume = jest.spyOn(limiter, 'consume');
    const acquire = jest.spyOn(gate, 'acquire');
    for (const e of ALLOWLIST) {
      await decide(e, operator(), OFF);
      await decide(e, anon(), OFF);
    }
    expect(consume).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('an unset flag is off', async () => {
    const d = await decide(publicRead, anon(), { VERCEL: '1' });
    expect(d.ok).toBe(false);
  });

  it('auth unconfigured → 503 console_not_configured, operator or not', async () => {
    clearConsoleAuthEnv();
    for (const r of [anon(), operator()]) {
      const d = await decide(publicRead, r, OFF);
      expect(d.ok).toBe(false);
      if (d.ok) return;
      expect(d.response.status).toBe(503);
      expect(await code(d.response)).toBe('console_not_configured');
    }
  });
});

describe('flag on', () => {
  it('an unlisted route is admin-class: anonymous → 403, operator → allowed', async () => {
    const t = 'http://localhost:4000/api/not-a-route';
    const a = await authorizeUpstream('cp', 'GET', t, anon(), {
      limiter,
      gate,
      env: ON,
    });
    expect(a.ok).toBe(false);
    const o = await authorizeUpstream('cp', 'GET', t, operator(), {
      limiter,
      gate,
      env: ON,
    });
    expect(o).toMatchObject({ ok: true, entry: null });
  });

  it('matches on the resolved pathname, so dot segments cannot reach admin as public', async () => {
    const t = 'http://localhost:4000/api/registry/agents/../../audit';
    const d = await authorizeUpstream('cp', 'GET', t, anon(), {
      limiter,
      gate,
      env: ON,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.response.status).toBe(403);
  });

  it('the 301st read in a minute → 429 CONSOLE_RATE_LIMITED with Retry-After', async () => {
    for (let i = 0; i < 300; i++)
      expect((await decide(publicRead, anon(), ON)).ok).toBe(true);
    const d = await decide(publicRead, anon(), ON);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.response.status).toBe(429);
    expect(Number(d.response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await d.response.json()).toMatchObject({
      code: 'CONSOLE_RATE_LIMITED',
      limit: 300,
    });
    // Another IP has its own bucket.
    expect((await decide(publicRead, req({}, '198.51.100.9'), ON)).ok).toBe(
      true,
    );
  });

  it('operators share the per-IP read bucket (no bypass of the shared limit)', async () => {
    for (let i = 0; i < 300; i++) await decide(publicRead, operator(), ON);
    expect((await decide(publicRead, operator(), ON)).ok).toBe(false);
  });

  it('the 6th launch in 10 minutes → 429; it charges read as well', async () => {
    const consume = jest.spyOn(limiter, 'consume');
    for (let i = 0; i < 5; i++)
      expect((await decide(runsLaunch, anon(), ON)).ok).toBe(true);
    expect(consume.mock.calls[0][0].map((c) => c.policy)).toEqual([
      'read',
      'launch',
    ]);
    const d = await decide(runsLaunch, anon(), ON);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.response.status).toBe(429);
    expect(await d.response.json()).toMatchObject({ limit: 5 });
  });

  it('anonymous CP read-key routes charge cpReadIp and the instance cpRead bucket; operators do not', async () => {
    const consume = jest.spyOn(limiter, 'consume');
    await decide(cpRead, anon(), ON);
    expect(consume.mock.calls[0][0]).toEqual([
      { policy: 'read', key: '203.0.113.7' },
      { policy: 'cpReadIp', key: '203.0.113.7' },
      { policy: 'cpRead', key: INSTANCE_KEY },
    ]);
    await decide(cpRead, operator(), ON);
    expect(consume.mock.calls[1][0]).toEqual([
      { policy: 'read', key: '203.0.113.7' },
    ]);
  });

  it('anonymous CP read with no read key → 503 before any bucket or slot is charged', async () => {
    const consume = jest.spyOn(limiter, 'consume');
    const acquire = jest.spyOn(gate, 'acquire');
    const noKey = { ...ON, CP_READ_API_KEY: '' };
    for (const e of [cpRead, cpStream]) {
      const d = await decide(e, anon(), noKey);
      expect(d.ok).toBe(false);
      if (!d.ok) {
        expect(d.response.status).toBe(503);
        expect(await code(d.response)).toBe('cp_read_key_unavailable');
      }
    }
    expect(consume).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    // Operators fall back to the admin key, so they still pass.
    expect((await decide(cpRead, operator(), noKey)).ok).toBe(true);
  });

  it('the 61st anonymous CP read per IP → 429 (cpReadIp)', async () => {
    for (let i = 0; i < 60; i++)
      expect((await decide(cpRead, anon(), ON)).ok).toBe(true);
    const d = await decide(cpRead, anon(), ON);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(await d.response.json()).toMatchObject({ limit: 60 });
  });

  it('the 5th concurrent stream per IP → 429; releasing a slot frees it', async () => {
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const d = await decide(stream, anon(), ON);
      expect(d.ok).toBe(true);
      slots.push(d);
    }
    const fifth = await decide(stream, anon(), ON);
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.response.status).toBe(429);
      expect(await fifth.response.json()).toMatchObject({ limit: 4 });
    }
    const first = slots[0];
    if (first.ok) {
      first.release();
      first.release(); // idempotent: frees one slot, not two
    }
    expect(gate.open('203.0.113.7')).toBe(3);
    expect((await decide(stream, anon(), ON)).ok).toBe(true);
    expect((await decide(stream, anon(), ON)).ok).toBe(false);
  });

  it('a refused stream slot charges no bucket', async () => {
    for (let i = 0; i < 4; i++) await decide(stream, anon(), ON);
    const consume = jest.spyOn(limiter, 'consume');
    await decide(stream, anon(), ON);
    expect(consume).not.toHaveBeenCalled();
  });

  it('a refused bucket gives the stream slot straight back', async () => {
    const refusing: Limiter = {
      consume: () => ({
        ok: false,
        policy: 'read',
        limit: 300,
        retryAfterSeconds: 7,
      }),
      size: () => 0,
      reset: () => {},
    };
    const d = await authorizeUpstream(
      stream.service,
      stream.method,
      target(stream),
      anon(),
      { limiter: refusing, gate, env: ON },
    );
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.response.headers.get('Retry-After')).toBe('7');
    expect(gate.open()).toBe(0);
  });

  it('a refused request spends nothing in the other buckets', async () => {
    for (let i = 0; i < 5; i++) await decide(runsLaunch, anon(), ON);
    // The 6th launch is refused on `launch`; its `read` charge rolls back,
    // so reads still have 300 - 5 left.
    await decide(runsLaunch, anon(), ON);
    for (let i = 0; i < 295; i++)
      expect((await decide(publicRead, anon(), ON)).ok).toBe(true);
    expect((await decide(publicRead, anon(), ON)).ok).toBe(false);
  });

  it('password unset: public routes still work, admin routes → 503 console_not_configured', async () => {
    clearConsoleAuthEnv();
    expect((await decide(publicRead, anon(), ON)).ok).toBe(true);
    const d = await decide(adminEntry, operator(), ON);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.response.status).toBe(503);
    expect(await code(d.response)).toBe('console_not_configured');
  });
});

describe('isOperator', () => {
  it('accepts a valid session cookie', async () => {
    const token = await signSession(TEST_SESSION_SECRET);
    expect(
      await isOperator(req({ cookie: `${SESSION_COOKIE}=${token}` })),
    ).toBe(true);
  });

  it('accepts operator Basic', async () => {
    expect(await isOperator(operator())).toBe(true);
  });

  it.each([
    ['no credentials', {}],
    ['a wrong Basic password', { authorization: `Basic ${btoa('op:nope')}` }],
    ['a garbled Authorization header', { authorization: 'Basic %%%' }],
    ['a tampered cookie', { cookie: `${SESSION_COOKIE}=v1.1.x.y` }],
  ])('rejects %s', async (_n, headers) => {
    expect(await isOperator(req(headers))).toBe(false);
  });

  it('is false when console auth is not configured', async () => {
    clearConsoleAuthEnv();
    expect(await isOperator(operator())).toBe(false);
  });
});

describe('rateLimited', () => {
  it('is a no-store 429 with the documented body and Retry-After', async () => {
    const res = rateLimited(300, 12);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('12');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: 'Too many requests',
      code: 'CONSOLE_RATE_LIMITED',
      retryAfterSeconds: 12,
      limit: 300,
    });
  });
});
