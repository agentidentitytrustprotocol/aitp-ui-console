/** The CP's per-issuer pull gauge, by issuer AID. Each issuing agent pulls
 *  its own entries from `GET /api/revocations` and signs them; an issuer
 *  that has stopped pulling enforces no new revocation, silently. Pulls made
 *  with an admin key are not recorded, so "no pull" means the issuer itself
 *  has not pulled since the CP process started. */
const GAUGE = 'aitp_control_plane_revocation_last_pull_timestamp_seconds';

/** aid -> epoch seconds of that issuer's last successful pull. Series
 *  without an `aid` label are skipped; when two keys share an AID the
 *  latest pull wins. */
export function parseIssuerLastPulls(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith(`${GAUGE}{`)) continue;
    const m = line.match(/^[a-z_]+\{([^}]*)\}\s+([0-9.eE+]+)$/);
    if (!m) continue;
    const aid = m[1].match(/(?:^|,)\s*aid="((?:[^"\\]|\\.)*)"/)?.[1];
    const secs = Number(m[2]);
    if (!aid || !Number.isFinite(secs)) continue;
    out.set(aid, Math.max(out.get(aid) ?? 0, secs));
  }
  return out;
}
