import { act, renderHook } from '@testing-library/react';
import { useSelection } from './use-selection';

describe('useSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useSelection<string>());
    expect(result.current.size).toBe(0);
    expect(result.current.ids).toEqual([]);
  });

  it('toggles a row in and out', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.toggle('a'));
    expect(result.current.has('a')).toBe(true);
    act(() => result.current.toggle('a'));
    expect(result.current.has('a')).toBe(false);
  });

  it('toggleAll selects every id when none are selected', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.toggleAll(['a', 'b', 'c']));
    expect(result.current.size).toBe(3);
  });

  it('toggleAll clears when all currently-visible ids are selected', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.toggleAll(['a', 'b']));
    expect(result.current.size).toBe(2);
    act(() => result.current.toggleAll(['a', 'b']));
    expect(result.current.size).toBe(0);
  });

  it('toggleAll selects all when only some are currently selected', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.toggle('a'));
    act(() => result.current.toggleAll(['a', 'b', 'c']));
    expect(result.current.size).toBe(3);
  });

  it('clear empties the selection', () => {
    const { result } = renderHook(() => useSelection<string>());
    act(() => result.current.toggleAll(['a', 'b']));
    act(() => result.current.clear());
    expect(result.current.size).toBe(0);
  });
});
