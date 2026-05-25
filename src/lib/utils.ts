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

export function shortId(id: string | null | undefined, len = 8): string {
  if (!id) return '';
  return id.length > len ? `${id.slice(0, len)}…` : id;
}
