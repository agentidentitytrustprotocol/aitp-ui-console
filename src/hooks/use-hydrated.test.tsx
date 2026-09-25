/**
 * These tests exercise a *real* server-render-then-hydrate pass (via
 * `react-dom/server`'s `renderToString` and `react-dom/client`'s
 * `hydrateRoot`), not React Testing Library's `render()`. RTL's `render()`
 * wraps the initial mount in `act()`, which flushes passive effects
 * (`useEffect`) synchronously before returning -- so by the time any
 * assertion runs, a `useEffect`-driven flag like `useHydrated()`'s is
 * already `true`, and a test written against `render()` alone can pass
 * whether or not the hydration-safety gate actually works. Only a genuine
 * two-pass render (server string, then client hydrate) can reproduce and
 * detect the actual hydration-mismatch race this hook exists to prevent.
 *
 * A mismatch can surface two ways depending on where in the tree it lands:
 * a recoverable `console.error` (React discards and regenerates just that
 * subtree), or an uncaught throw out of the commit phase when there's no
 * boundary to catch it (seen for a bare root in this jsdom setup with no
 * Next.js App Router scaffolding around it). `hydrateAndObserve` below
 * treats either as "hydration mismatched" -- both are the same underlying
 * failure this hook exists to prevent, just different blast radii.
 */
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { useHydrated } from './use-hydrated';

async function hydrateAndObserve(html: string, ui: React.ReactElement) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const consoleErrors: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((arg: unknown) => {
    consoleErrors.push(arg instanceof Error ? arg.message : String(arg));
  });

  let thrown: unknown = null;
  try {
    hydrateRoot(container, ui, {
      onRecoverableError: (error) => {
        consoleErrors.push(error instanceof Error ? error.message : String(error));
      },
    });
    // Let the passive effect that flips `hydrated` to true (and any
    // recoverable-error reporting) actually flush -- hydrateRoot doesn't do
    // this synchronously, unlike RTL's act()-wrapped render().
    await new Promise((r) => setTimeout(r, 50));
  } catch (err) {
    thrown = err;
  }

  spy.mockRestore();
  const mismatched =
    thrown !== null ||
    consoleErrors.some((msg) => msg.includes('Hydration failed') || msg.includes('did not match'));
  const finalText = container.textContent;
  container.remove();
  return { mismatched, finalText };
}

describe('useHydrated', () => {
  it('never causes a hydration mismatch, even when the value it gates changes before hydration finishes', async () => {
    // Mirrors the real bug: a value that starts "unresolved" on the server
    // and is already resolved by the time the client hydrates (e.g. a
    // useQuery that settles synchronously fast). A component that read
    // `liveValue` directly (no `useHydrated` gate) would render "server"
    // during SSR and "client-resolved" on the client's first hydration
    // pass -- a text mismatch, and exactly what this hook prevents.
    let liveValue = 'server';

    function Widget() {
      const hydrated = useHydrated();
      return <div>{!hydrated ? 'server' : liveValue}</div>;
    }

    const html = renderToString(<Widget />);
    expect(html).toContain('server');

    // Simulate the value already having "resolved" by the time hydration
    // runs on the client -- the exact race that broke ConnectionPanel.
    liveValue = 'client-resolved';

    const { mismatched, finalText } = await hydrateAndObserve(html, <Widget />);

    expect(mismatched).toBe(false);
    // Confirms the widget actually swaps to the live value right after --
    // the fix isn't just suppressing the error, the real content still
    // arrives.
    expect(finalText).toBe('client-resolved');
  });

  it('shows the value would otherwise mismatch, proving the test above is a real regression guard', async () => {
    // Same race, but WITHOUT the useHydrated gate -- this should genuinely
    // fail hydration, confirming the test above isn't vacuously passing.
    let liveValue = 'server';

    function UngatedWidget() {
      return <div>{liveValue}</div>;
    }

    const html = renderToString(<UngatedWidget />);
    liveValue = 'client-resolved';

    const { mismatched } = await hydrateAndObserve(html, <UngatedWidget />);

    expect(mismatched).toBe(true);
  });
});
