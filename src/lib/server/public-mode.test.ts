/** @jest-environment node */
import { isPublicMode, resetPublicModeWarnings } from './public-mode';

const env = (v?: string) =>
  v === undefined ? {} : { AITP_CONSOLE_PUBLIC_MODE: v };

describe('isPublicMode', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    resetPublicModeWarnings();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it.each(['on', 'ON', 'true', 'True', '1', ' on '])('is on for %p', (v) => {
    expect(isPublicMode(env(v))).toBe(true);
  });

  it.each([undefined, '', 'off', 'OFF', 'false', '0'])(
    'is off for %p without warning',
    (v) => {
      expect(isPublicMode(env(v))).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('fails closed on an unknown value and warns once per value', () => {
    expect(isPublicMode(env('ture'))).toBe(false);
    expect(isPublicMode(env('ture'))).toBe(false);
    expect(isPublicMode(env('yes'))).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    // Never echoes the value itself.
    expect(String(warn.mock.calls[0][0])).not.toContain('ture');
  });

  it('reads process.env per call', () => {
    const prev = process.env.AITP_CONSOLE_PUBLIC_MODE;
    try {
      process.env.AITP_CONSOLE_PUBLIC_MODE = 'on';
      expect(isPublicMode()).toBe(true);
      process.env.AITP_CONSOLE_PUBLIC_MODE = 'off';
      expect(isPublicMode()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.AITP_CONSOLE_PUBLIC_MODE;
      else process.env.AITP_CONSOLE_PUBLIC_MODE = prev;
    }
  });
});
