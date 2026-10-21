// Fails CI when package-lock.json does not pin the aitp SDK together with all
// four of its native platform packages at the same version. A full in-place
// `npm install` of a new aitp minor has pruned them before (see `//aitp` in
// package.json); without linux-x64-gnu the addon cannot load on Vercel or CI.
import { readFileSync } from 'node:fs';

const pkgs = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url))).packages;
const sdk = pkgs['node_modules/aitp'];
const platforms = ['darwin-arm64', 'darwin-x64', 'linux-arm64-gnu', 'linux-x64-gnu'];
const errors = [];

if (!sdk) errors.push('node_modules/aitp is missing');
for (const p of platforms) {
  const entry = pkgs[`node_modules/@agentidentitytrustprotocol/aitp-${p}`];
  if (!entry) errors.push(`aitp-${p} is missing`);
  else if (sdk && entry.version !== sdk.version) errors.push(`aitp-${p} is ${entry.version}, aitp is ${sdk.version}`);
  else if (p.startsWith('linux') && !entry.libc) errors.push(`aitp-${p} has no libc field`);
}

if (errors.length) {
  console.error(`package-lock.json aitp check failed:\n  ${errors.join('\n  ')}`);
  console.error('Fix: drop the aitp + @agentidentitytrustprotocol/* lock entries and node_modules dirs, then npm install.');
  process.exit(1);
}
console.log(`aitp ${sdk.version} locked with all ${platforms.length} platform packages`);
