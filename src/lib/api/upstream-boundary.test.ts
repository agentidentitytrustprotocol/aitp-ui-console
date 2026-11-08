/** @jest-environment node */
/**
 * Every upstream call goes through the proxy helpers, which authorize the
 * caller (src/lib/server/access.ts) and choose the credentials. A route
 * that fetched directly, or reached the module's test hook, would bypass
 * both.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');
const HELPERS = new Set([
  'proxyGet',
  'proxyGetVerified',
  'proxySse',
  'proxyPost',
  'proxyPut',
  'proxyPatch',
  'proxyDelete',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.includes('/test/');
const sources = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !isTest(f));
const routes = sources.filter((f) => /[/\\]app[/\\].*[/\\]route\.ts$/.test(f));

/** Strip comments so prose mentioning fetch() doesn't count. */
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('upstream boundary', () => {
  it('found the route handlers', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it.each(routes.map((f) => relative(SRC, f)))(
    '%s never calls fetch directly',
    (rel) => {
      expect(code(join(SRC, rel))).not.toMatch(/\bfetch\s*\(/);
    },
  );

  it('only the proxy helpers are imported from @/lib/api/proxy outside tests', () => {
    const bad: string[] = [];
    for (const f of sources) {
      if (f.endsWith(join('lib', 'api', 'proxy.ts'))) continue;
      const src = code(f);
      const re =
        /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"](?:@\/lib\/api\/proxy|(?:\.\.?\/)+(?:lib\/)?(?:api\/)?proxy)['"]/g;
      for (const m of src.matchAll(re)) {
        if (m[1]) continue; // type-only
        for (const name of m[2]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          const local = name.replace(/^type\s+/, '').split(/\s+as\s+/)[0];
          if (name.startsWith('type ')) continue;
          if (!HELPERS.has(local)) bad.push(`${relative(SRC, f)}: ${local}`);
        }
      }
      if (/\b__testing\b/.test(src)) bad.push(`${relative(SRC, f)}: __testing`);
      if (
        /import\s+\*\s+as\s+\w+\s+from\s+['"]@\/lib\/api\/proxy['"]/.test(src)
      )
        bad.push(`${relative(SRC, f)}: namespace import`);
    }
    expect(bad).toEqual([]);
  });
});
