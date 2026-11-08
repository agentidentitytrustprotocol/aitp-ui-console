/** The console's browser-facing API, as the live suite uses it: the same
 *  origin-relative routes the UI calls (`/api/playground/*`, `/api/auth/*`,
 *  `/login`). A TS port of the client in aitp-playground
 *  `scripts/console_e2e.py` (`ConsoleClient`), over a Playwright
 *  APIRequestContext so a page's cookies (`page.request`) or a standalone
 *  context can drive it. Never talks to a backend directly. */
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { Json, RunEvent } from './outcome';

export const SESSION_COOKIE = '__Host-aitp-console-session';
export const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);

/** Decode an SSE body into events. The playground frames each event as
 *  `data: <json>\n\n` and idles with `: heartbeat` comments; consecutive
 *  `data:` lines of one event join with `\n`; `event:`/`id:` are kept as
 *  `_event`/`_id`; a non-JSON payload becomes `{type:'_unparsed', data}`. */
export function parseSse(body: string): RunEvent[] {
  const out: RunEvent[] = [];
  let data: string[] = [];
  let meta: Record<string, string> = {};
  const flush = () => {
    if (data.length === 0) {
      meta = {};
      return;
    }
    const raw = data.join('\n');
    data = [];
    let evt: RunEvent;
    try {
      const parsed: unknown = JSON.parse(raw);
      evt = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as RunEvent) : { type: '_unparsed', data: raw };
    } catch {
      evt = { type: '_unparsed', data: raw };
    }
    for (const [k, v] of Object.entries(meta)) if (!(`_${k}` in evt)) evt[`_${k}`] = v;
    meta = {};
    out.push(evt);
  };
  for (const line of body.split(/\r?\n/)) {
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith(':')) continue;
    const i = line.indexOf(':');
    const field = i === -1 ? line : line.slice(0, i);
    let value = i === -1 ? '' : line.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event' || field === 'id') meta[field] = value;
  }
  flush();
  return out;
}

export interface EventsResult {
  events: RunEvent[];
  /** True when the replay reached `stream.end` (excluded from `events`). */
  complete: boolean;
  error: string | null;
}

export interface HttpResult<T = unknown> {
  status: number;
  body: T | null;
  retryAfter: string | null;
}

async function jsonOrNull(r: APIResponse): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

const enc = (id: string) => encodeURIComponent(id);
const encRef = (ref: string) => encodeURIComponent(ref).replace(/%2F/gi, '/').replace(/%40/gi, '@');

export class ConsoleApi {
  constructor(
    readonly req: APIRequestContext,
    readonly origin: string,
  ) {}

  async session(): Promise<{ publicMode?: boolean; signedIn?: boolean } | null> {
    const r = await this.req.get('/api/auth/session');
    return r.ok() ? ((await jsonOrNull(r)) as { publicMode?: boolean; signedIn?: boolean }) : null;
  }

  /** `POST /login` with JSON `{password}`; the edge checks `Origin` on every
   *  mutation, `/login` included (src/proxy.ts). Returns the status only. */
  async login(password: string): Promise<number> {
    const r = await this.req.post('/login', {
      data: { password },
      headers: { Origin: this.origin },
      maxRedirects: 0,
    });
    return r.status();
  }

  async get(path: string): Promise<HttpResult> {
    const r = await this.req.get(path, { maxRedirects: 0 });
    return { status: r.status(), body: await jsonOrNull(r), retryAfter: r.headers()['retry-after'] ?? null };
  }

  async post(path: string, data: unknown = {}): Promise<HttpResult> {
    const r = await this.req.post(path, { data, headers: { Origin: this.origin }, maxRedirects: 0 });
    return { status: r.status(), body: await jsonOrNull(r), retryAfter: r.headers()['retry-after'] ?? null };
  }

  async scenarios(): Promise<string[]> {
    const r = await this.req.get('/api/playground/scenarios');
    if (!r.ok()) throw new Error(`GET /api/playground/scenarios -> ${r.status()}`);
    const body = (await r.json()) as { scenarios?: { ref?: string }[] };
    return (body.scenarios ?? []).map((s) => s.ref).filter((x): x is string => typeof x === 'string');
  }

  async scenario(ref: string): Promise<Json> {
    const r = await this.req.get(`/api/playground/scenarios/${encRef(ref)}`);
    if (!r.ok()) throw new Error(`GET scenario ${ref} -> ${r.status()}`);
    return (await r.json()) as Json;
  }

  launch(ref: string, inputs: Json, label?: string): Promise<HttpResult<Json>> {
    return this.post('/api/playground/runs', { scenario_ref: ref, inputs, ...(label ? { run_label: label } : {}) }) as Promise<
      HttpResult<Json>
    >;
  }

  async run(runId: string): Promise<Json> {
    const r = await this.req.get(`/api/playground/runs/${enc(runId)}`);
    if (!r.ok()) throw new Error(`GET run -> ${r.status()}`);
    return (await r.json()) as Json;
  }

  async status(runId: string): Promise<HttpResult<Json>> {
    return this.get(`/api/playground/runs/${enc(runId)}/status`) as Promise<HttpResult<Json>>;
  }

  /** Poll `/status` until terminal or the deadline. A 429 waits its
   *  Retry-After (capped at the time left). Returns the last status seen. */
  async waitTerminal(runId: string, opts: { deadline: number; intervalMs?: number }): Promise<string | null> {
    let st: string | null = null;
    const interval = opts.intervalMs ?? 5_000;
    for (;;) {
      const r = await this.status(runId);
      let wait = interval;
      if (r.status === 200) st = (r.body?.status as string) ?? st;
      else if (r.status === 429) wait = Math.max(interval, (Number(r.retryAfter) || 5) * 1000);
      if (st && TERMINAL_STATUSES.has(st)) return st;
      const left = opts.deadline - Date.now();
      if (left <= 0) return st;
      await new Promise((res) => setTimeout(res, Math.min(wait, left)));
    }
  }

  /** Read a finished run's event replay (`/events` ends with `stream.end`).
   *  Call only after the run is terminal: the request buffers the body. */
  async events(runId: string, timeoutMs = 60_000): Promise<EventsResult> {
    try {
      const r = await this.req.get(`/api/playground/runs/${enc(runId)}/events`, {
        headers: { Accept: 'text/event-stream' },
        timeout: timeoutMs,
      });
      if (r.status() !== 200) return { events: [], complete: false, error: `HTTP ${r.status()}` };
      const all = parseSse(await r.text());
      const end = all.findIndex((e) => e.type === 'stream.end');
      return end === -1
        ? { events: all, complete: false, error: 'stream ended without stream.end' }
        : { events: all.slice(0, end), complete: true, error: null };
    } catch (e) {
      return { events: [], complete: false, error: e instanceof Error ? e.name : 'error' };
    }
  }
}
