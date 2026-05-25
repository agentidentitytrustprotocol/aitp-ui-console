/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.ts$',
    '\\.integration\\.test\\.tsx$',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // recharts and lucide-react ship ESM-only and don't play well with
    // ts-jest under CommonJS. Most tests don't actually render icons or
    // charts; these stubs render simple <div>s so tests stay fast and
    // free of ESM transform headaches.
    '^recharts$': '<rootDir>/src/test/recharts-stub.tsx',
    '^lucide-react$': '<rootDir>/src/test/lucide-stub.tsx',
  },
  setupFiles: ['<rootDir>/src/test/polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'ES2022',
          esModuleInterop: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
};
