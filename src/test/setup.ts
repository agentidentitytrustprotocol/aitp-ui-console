import '@testing-library/jest-dom';

// Silence noisy reconnect-loop warnings from useSse during component tests.
const origError = console.error;
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (msg.includes('not wrapped in act')) return;
    origError(...(args as Parameters<typeof console.error>));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});
