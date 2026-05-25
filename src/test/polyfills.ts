/** Polyfills that need to run before any test module loads. */

// Node 24+ ships fetch/Request/Response globally, but Next.js Request shims
// expect TextEncoder/TextDecoder on the global object even when fetch already
// exists — jsdom sets up TextEncoder differently from Node so make sure both
// flavours are present.
if (typeof (globalThis as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const util = require('util');
  (globalThis as Record<string, unknown>).TextEncoder = util.TextEncoder;
  (globalThis as Record<string, unknown>).TextDecoder = util.TextDecoder;
}

// jsdom doesn't ship EventSource. Provide a tiny constructible stub that
// individual tests can replace via jest.spyOn.
if (typeof (globalThis as { EventSource?: unknown }).EventSource === 'undefined') {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
    onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
    onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
    readyState = 0;
    closed = false;

    constructor(url: string) {
      this.url = url;
      FakeEventSource.instances.push(this);
    }

    close() {
      this.closed = true;
      this.readyState = 2;
    }

    // Helpers for tests
    emit(data: unknown) {
      this.onmessage?.call(
        this as unknown as EventSource,
        new MessageEvent('message', { data: JSON.stringify(data) }),
      );
    }
    open() {
      this.readyState = 1;
      this.onopen?.call(this as unknown as EventSource, new Event('open'));
    }
    fail() {
      this.readyState = 2;
      this.onerror?.call(this as unknown as EventSource, new Event('error'));
    }
  }
  (globalThis as Record<string, unknown>).EventSource = FakeEventSource;
}
