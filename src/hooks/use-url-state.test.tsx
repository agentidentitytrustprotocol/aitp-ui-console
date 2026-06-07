import { act, renderHook } from '@testing-library/react';
import { useUrlEnum, useUrlInt, useUrlState } from './use-url-state';

let currentParams = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/audit',
  useRouter: () => ({ replace }),
  useSearchParams: () => currentParams,
}));

beforeEach(() => {
  currentParams = new URLSearchParams();
  replace.mockClear();
});

describe('useUrlState', () => {
  it('reads the value from search params, falling back to default', () => {
    currentParams = new URLSearchParams('actor=admin');
    const { result } = renderHook(() => useUrlState('actor'));
    expect(result.current[0]).toBe('admin');

    const { result: empty } = renderHook(() => useUrlState('action', 'fallback'));
    expect(empty.current[0]).toBe('fallback');
  });

  it('sets the value via router.replace and preserves other params', () => {
    currentParams = new URLSearchParams('other=keep');
    const { result } = renderHook(() => useUrlState('q'));
    act(() => result.current[1]('hello'));
    expect(replace).toHaveBeenCalledWith('/audit?other=keep&q=hello', { scroll: false });
  });

  it('removes the param from the URL when set to default or empty', () => {
    currentParams = new URLSearchParams('q=hello&other=keep');
    const { result } = renderHook(() => useUrlState('q'));
    act(() => result.current[1](''));
    expect(replace).toHaveBeenCalledWith('/audit?other=keep', { scroll: false });
  });

  it('strips the leading "?" when only the param being removed was present', () => {
    currentParams = new URLSearchParams('q=hello');
    const { result } = renderHook(() => useUrlState('q'));
    act(() => result.current[1](''));
    expect(replace).toHaveBeenCalledWith('/audit', { scroll: false });
  });
});

describe('useUrlEnum', () => {
  const TABS = ['events', 'delegations', 'tcts'] as const;

  it('falls back to the default when the param is missing', () => {
    const { result } = renderHook(() => useUrlEnum('tab', TABS, 'events'));
    expect(result.current[0]).toBe('events');
  });

  it('falls back when the param is set to a value outside the union', () => {
    currentParams = new URLSearchParams('tab=garbage');
    const { result } = renderHook(() => useUrlEnum('tab', TABS, 'events'));
    expect(result.current[0]).toBe('events');
  });

  it('returns the param when it matches an allowed value', () => {
    currentParams = new URLSearchParams('tab=tcts');
    const { result } = renderHook(() => useUrlEnum('tab', TABS, 'events'));
    expect(result.current[0]).toBe('tcts');
  });
});

describe('useUrlInt', () => {
  const ALLOWED = [50, 100, 250, 500] as const;

  it('falls back to the default when missing or non-numeric', () => {
    const { result: a } = renderHook(() => useUrlInt('limit', 100));
    expect(a.current[0]).toBe(100);

    currentParams = new URLSearchParams('limit=not-a-number');
    const { result: b } = renderHook(() => useUrlInt('limit', 100));
    expect(b.current[0]).toBe(100);
  });

  it('respects the allowed-values whitelist', () => {
    currentParams = new URLSearchParams('limit=999');
    const { result } = renderHook(() => useUrlInt('limit', 100, ALLOWED));
    expect(result.current[0]).toBe(100);

    currentParams = new URLSearchParams('limit=250');
    const { result: ok } = renderHook(() => useUrlInt('limit', 100, ALLOWED));
    expect(ok.current[0]).toBe(250);
  });
});
