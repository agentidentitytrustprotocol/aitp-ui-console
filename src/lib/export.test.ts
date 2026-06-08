import { toCsv } from './export';

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
