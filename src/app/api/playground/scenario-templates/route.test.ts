/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

const proxyGet = jest.fn(async () => new Response('{}'));
jest.mock('@/lib/api/proxy', () => ({ proxyGet }));

import { GET } from './route';

const call = (qs: string) =>
  GET(
    new NextRequest(
      `http://localhost:3001/api/playground/scenario-templates${qs}`,
    ),
  );

describe('GET /api/playground/scenario-templates', () => {
  beforeEach(() => proxyGet.mockClear());

  it('is 400 without a ref', async () => {
    expect((await call('')).status).toBe(400);
    expect(proxyGet).not.toHaveBeenCalled();
  });

  it('keeps slashes and @ but encodes each segment', async () => {
    await call('?ref=intra-org/research@1.0.0');
    expect(proxyGet).toHaveBeenCalledWith(
      'playground',
      '/scenarios/intra-org/research%401.0.0/templates',
      expect.anything(),
    );
  });

  it.each([
    ['a/b?x', '/scenarios/a/b%3Fx/templates'],
    ['a/b#x', '/scenarios/a/b%23x/templates'],
    ['a/b%2F..', '/scenarios/a/b%252F../templates'],
  ])('ref %j cannot change the upstream URL', async (ref, path) => {
    await call(`?ref=${encodeURIComponent(ref)}`);
    expect(proxyGet).toHaveBeenCalledWith(
      'playground',
      path,
      expect.anything(),
    );
  });
});
