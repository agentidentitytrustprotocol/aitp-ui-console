import { parseIssuerLastPulls } from './revocation-relay';

const G = 'aitp_control_plane_revocation_last_pull_timestamp_seconds';

describe('parseIssuerLastPulls', () => {
  it('keys the gauge by its aid label', () => {
    const text = [
      `# HELP ${G} ...`,
      `# TYPE ${G} gauge`,
      `${G}{issuer="a",aid="aid:pubkey:a"} 1700000000`,
      `${G}{aid="aid:pubkey:b",issuer="b"} 1700000100`,
      'aitp_control_plane_other{aid="aid:pubkey:c"} 5',
    ].join('\n');
    expect([...parseIssuerLastPulls(text)]).toEqual([
      ['aid:pubkey:a', 1700000000],
      ['aid:pubkey:b', 1700000100],
    ]);
  });

  it('skips series without an aid and keeps the latest pull when two keys share an AID', () => {
    const text = [
      `${G}{issuer="legacy"} 1700000000`,
      `${G}{issuer="k1",aid="aid:pubkey:a"} 1700000000`,
      `${G}{issuer="k2",aid="aid:pubkey:a"} 1700000500`,
    ].join('\n');
    expect([...parseIssuerLastPulls(text)]).toEqual([['aid:pubkey:a', 1700000500]]);
  });

  it('returns nothing for empty or unrelated text', () => {
    expect(parseIssuerLastPulls('').size).toBe(0);
    expect(parseIssuerLastPulls('<html>').size).toBe(0);
  });
});
