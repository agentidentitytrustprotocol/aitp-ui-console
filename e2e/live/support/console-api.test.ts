/** @jest-environment node */
import { parseSse } from './console-api';

describe('parseSse', () => {
  it('decodes data frames, skips heartbeats, keeps event/id and stops nowhere', () => {
    const body = [
      ': heartbeat',
      '',
      'data: {"type":"run.started"}',
      '',
      'event: x',
      'id: 7',
      'data: {"type":"llm.complete",',
      'data: "stub":false}',
      '',
      'data: not json',
      '',
      'data: {"type":"stream.end"}',
      '',
    ].join('\n');
    expect(parseSse(body)).toEqual([
      { type: 'run.started' },
      { type: 'llm.complete', stub: false, _event: 'x', _id: '7' },
      { type: '_unparsed', data: 'not json' },
      { type: 'stream.end' },
    ]);
  });
  it('handles CRLF and a trailing frame without a blank line', () => {
    expect(parseSse('data: {"type":"a"}\r\n\r\ndata: {"type":"b"}')).toEqual([{ type: 'a' }, { type: 'b' }]);
  });
  it('treats a JSON array as unparsed', () => {
    expect(parseSse('data: [1]\n\n')).toEqual([{ type: '_unparsed', data: '[1]' }]);
  });
});
