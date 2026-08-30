import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// package.json pins eslint to the latest 9.x, not 10: eslint-config-next's
// bundled eslint-plugin-react (currently 7.37.5, itself latest) calls an
// ESLint context method removed in ESLint 10 and crashes outright, despite
// eslint-config-next's peerDependencies advertising eslint ">=9.0.0" as if
// 10 were supported. Revisit once eslint-plugin-react ships a fix.

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),
  {
    // Test files intentionally use lazy `require()` so that a module load
    // (and its module-scope env var reads) happens after `beforeAll` sets
    // up test state -- a static `import` would run too early.
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
