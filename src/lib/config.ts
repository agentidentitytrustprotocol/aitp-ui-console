export const serverConfig = {
  playgroundUrl: process.env.PLAYGROUND_URL ?? 'http://localhost:8000',
  playgroundApiKey: process.env.PLAYGROUND_API_KEY ?? '',
  cpUrl: process.env.CP_URL ?? 'http://localhost:4000',
  cpApiKey: process.env.CP_API_KEY ?? '',
  // Pins the CP's identity for Tier-2 revocation-snapshot verification
  // (see plans/cp-signed-artifact-verification.md, Phase 4). Not a
  // secret -- an AID is a public key -- but it stays server-side because
  // the verdict, not the pin, is what the browser needs. Blank means
  // Tier 1 (self-consistency only): the same name and meaning as the
  // playground's CP_AID (revocation_refresh.py).
  cpAid: process.env.CP_AID ?? '',
};

export const clientConfig = {
  appName: 'AITP Console',
  version: '0.1.0',
};
