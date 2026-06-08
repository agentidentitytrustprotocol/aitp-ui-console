import { mergeRunEvents } from './run-detail';

describe('mergeRunEvents', () => {
  it('prefers persisted query events when the run is terminal', () => {
    const out = mergeRunEvents(false, [{ id: 'live' }], [{ id: 'persisted' }]);
    expect(out).toEqual([{ id: 'persisted' }]);
  });

  it('falls back to live events when the run is terminal but the query has none', () => {
    const out = mergeRunEvents(false, [{ id: 'live' }], undefined);
    expect(out).toEqual([{ id: 'live' }]);
  });

  it('prefers live events while the run is active', () => {
    const out = mergeRunEvents(true, [{ id: 'live' }], [{ id: 'persisted' }]);
    expect(out).toEqual([{ id: 'live' }]);
  });

  it('falls back to persisted events when the SSE buffer is empty mid-run', () => {
    const out = mergeRunEvents(true, [], [{ id: 'persisted' }]);
    expect(out).toEqual([{ id: 'persisted' }]);
  });

  it('returns [] when neither source has data', () => {
    expect(mergeRunEvents(true, [], undefined)).toEqual([]);
    expect(mergeRunEvents(false, [], undefined)).toEqual([]);
  });
});
