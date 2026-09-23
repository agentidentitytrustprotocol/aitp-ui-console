import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Pretty-print an AID for compact display: first 8 chars after prefix + last 4. */
export function formatAid(aid: string | null | undefined, headLen = 8, tailLen = 4): string {
  if (!aid) return '';
  const head = aid.startsWith('aid:pubkey:') ? aid.slice('aid:pubkey:'.length) : aid;
  if (head.length <= headLen + tailLen + 1) return aid;
  return `${head.slice(0, headLen)}…${head.slice(-tailLen)}`;
}

export function formatGrants(grants: string[] | null | undefined): string {
  if (!grants || grants.length === 0) return '∅';
  return grants.join(', ');
}

/** Best-effort "time ago" string from a Date or ISO string. */
export function timeAgo(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined) return '—';
  const ts = typeof input === 'number'
    ? (input < 1e12 ? input * 1000 : input)
    : new Date(input).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return 'just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Run-relative offset, in **milliseconds**, of a run event.
 *
 *  Playground stamps every run event's `ts` as **epoch seconds** — a float
 *  from python's `time.time()`, on both of the two producers that feed the
 *  SSE stream: the orchestrator's pydantic model
 *  (`runner/context.py`'s `RunEvent.ts = Field(default_factory=time.time)`)
 *  and the agent subprocesses' telemetry POST
 *  (`agents/base/telemetry.py:19`, `"ts": time.time()`). Nothing between
 *  either emit site and the frame this console receives rewrites it:
 *  `runner/store.py`'s `append_event` appends the dict verbatim,
 *  `api/telemetry.py` appends the POSTed body verbatim, and
 *  `api/runs.py`'s `/runs/{id}/events` `json.dumps`es whatever is in the
 *  record. Observed live on the wire: `ts=1790202148.211193` on a
 *  `run.started`, `ts=1790202220.8067431` on an agent-channel
 *  `trust.established`.
 *
 *  So `ts` is **never** already relative to the run: "time since run start"
 *  is a value this console has to derive, which is what this function is.
 *  Deliberately *not* the `ts < 1e12 ? ts * 1000 : ts` magnitude heuristic
 *  `run-list.tsx`'s `formatCreatedAt` uses — that one disambiguates a single
 *  absolute value being rendered as a date, and applying it to an offset
 *  would silently mis-scale any offset past ~11.5 days while papering over
 *  the unit question instead of answering it.
 *
 *  The result may be **negative**: the two producers stamp `time.time()` in
 *  different processes, so subprocess clock skew can place an agent event
 *  fractionally before the orchestrator's first event. Callers render that
 *  honestly rather than flipping the sign. */
export function runOffsetMs(ts: number, baseTs: number): number {
  return (ts - baseTs) * 1_000;
}

export function shortId(id: string | null | undefined, len = 8): string {
  if (!id) return '';
  return id.length > len ? `${id.slice(0, len)}…` : id;
}
