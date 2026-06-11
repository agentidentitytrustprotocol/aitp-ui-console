import { downloadText, toCsv } from './export';

describe('toCsv', () => {
  it('renders a header row from labels (or keys) and one row per record', () => {
    const csv = toCsv(
      [
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
      ],
      [
        { key: 'id', label: 'ID' },
        { key: 'n' },
      ],
    );
    expect(csv).toBe('ID,n\na,1\nb,2');
  });

  it('quotes cells containing commas, quotes, or newlines', () => {
    const csv = toCsv(
      [{ s: 'hello, "world"' }, { s: 'multi\nline' }],
      [{ key: 's' }],
    );
    expect(csv).toBe('s\n"hello, ""world"""\n"multi\nline"');
  });

  it('JSON-stringifies object and array values', () => {
    const csv = toCsv([{ payload: { a: 1 } }, { payload: [1, 2] }], [{ key: 'payload' }]);
    expect(csv).toBe('payload\n"{""a"":1}"\n"[1,2]"');
  });

  it('renders null and undefined as empty cells', () => {
    const csv = toCsv(
      [{ a: null as unknown, b: undefined as unknown }, { a: 'x', b: 'y' }],
      [{ key: 'a' }, { key: 'b' }],
    );
    expect(csv).toBe('a,b\n,\nx,y');
  });
});

describe('downloadText', () => {
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    jest.useFakeTimers();
    URL.createObjectURL = jest.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  });

  it('creates an anchor, clicks it, and cleans it up out of the DOM', () => {
    const clicks: HTMLAnchorElement[] = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this as HTMLAnchorElement);
    };

    try {
      downloadText('report.csv', 'a,b\n1,2', 'text/csv');

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(clicks).toHaveLength(1);
      expect(clicks[0].download).toBe('report.csv');
      expect(clicks[0].href).toContain('blob:fake-url');
      // The anchor is removed synchronously after the click.
      expect(document.querySelector('a[download]')).toBeNull();
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });

  it('revokes the object URL on the next tick (Safari-safe deferral)', () => {
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = () => undefined;

    try {
      downloadText('x.txt', 'hi', 'text/plain');
      // Not revoked synchronously…
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
      // …revoked after the deferred timeout.
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });
});
