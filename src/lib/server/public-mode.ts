/** `AITP_CONSOLE_PUBLIC_MODE`: whether anonymous visitors may use the
 *  console's public surface (pages, allowlisted reads, SSE and run launches).
 *
 *  Strict parse, read per call (never captured at import, so a stale module
 *  can't keep a flag the environment has since flipped). Only `on`, `true`
 *  and `1` (any case) enable it; `off`, `false`, `0` and unset disable it.
 *  Any other value disables it and warns once per distinct value, so a typo
 *  like `ture` fails closed instead of silently opening the console. */
export const PUBLIC_MODE_ENV = 'AITP_CONSOLE_PUBLIC_MODE';

const ON = new Set(['on', 'true', '1']);
const OFF = new Set(['off', 'false', '0', '']);
const warned = new Set<string>();

export function isPublicMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const raw = (env[PUBLIC_MODE_ENV] ?? '').trim().toLowerCase();
  if (ON.has(raw)) return true;
  if (!OFF.has(raw) && !warned.has(raw)) {
    warned.add(raw);
    console.warn(
      `[public-mode] unrecognised ${PUBLIC_MODE_ENV} value; treating as off (accepted: on|off|true|false|1|0)`,
    );
  }
  return false;
}

/** Test hook: forget which unknown values already warned. */
export function resetPublicModeWarnings(): void {
  warned.clear();
}
