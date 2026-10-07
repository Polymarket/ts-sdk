import { describe, expect, it, vi } from 'vitest';
import { version } from '../package.json';
import { createClientMetadata } from './client-metadata';

function metadataWithGlobals(globals: Record<string, unknown>): string {
  try {
    for (const [name, value] of Object.entries({
      Bun: undefined,
      Deno: undefined,
      process: undefined,
      navigator: undefined,
      window: undefined,
      self: undefined,
      importScripts: undefined,
      ...globals,
    })) {
      vi.stubGlobal(name, value);
    }
    return createClientMetadata();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('client metadata', () => {
  it('uses the client package version and detects Node despite navigator globals', () => {
    expect(
      metadataWithGlobals({
        process: { versions: { node: '24.1.2' } },
        navigator: { userAgent: 'Node.js/24 Chrome/140.0.0.0' },
      }),
    ).toBe(`@polymarket/client@${version}:nodejs@24.1.2`);
  });

  it.each([
    [
      { Bun: { version: '1.2.3' }, Deno: { version: { deno: '2.3.4' } } },
      'bun@1.2.3',
    ],
    [{ Deno: { version: { deno: '2.3.4' } } }, 'deno@2.3.4'],
  ])('prioritizes alternative runtimes over Node compatibility globals', (globals, runtime) => {
    expect(
      metadataWithGlobals({
        process: { versions: { node: '24.1.2' } },
        ...globals,
      }),
    ).toBe(`@polymarket/client@${version}:${runtime}`);
  });

  it.each([
    [
      'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.54',
      'edge@140.0.3485.54',
    ],
    [
      'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 EdgA/140.0.3485.54',
      'edge@140.0.3485.54',
    ],
    [
      'Mozilla/5.0 Version/18.6 Safari/605.1.15 EdgiOS/140.0.3485.54',
      'edge@140.0.3485.54',
    ],
    ['Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', 'chrome@140.0.0.0'],
    [
      'Mozilla/5.0 CriOS/140.0.7339.39 Mobile/15E148 Safari/604.1',
      'chrome@140.0.7339.39',
    ],
    ['Mozilla/5.0 Gecko/20100101 Firefox/143.0', 'firefox@143.0'],
    ['Mozilla/5.0 FxiOS/143.0 Mobile/15E148 Safari/605.1.15', 'firefox@143.0'],
    ['Mozilla/5.0 Version/18.6 Safari/605.1.15', 'safari@18.6'],
    ['Mozilla/5.0 Safari/605.1.15', 'safari@unknown'],
  ])('reports browser family and version without overlapping UA tokens: %s', (userAgent, runtime) => {
    expect(metadataWithGlobals({ navigator: { userAgent }, window: {} })).toBe(
      `@polymarket/client@${version}:${runtime}`,
    );
  });

  it.each([
    [
      { window: {}, navigator: { userAgent: 'Unrecognized browser' } },
      'browser@unknown',
    ],
    [{ self: {}, importScripts: () => {} }, 'worker@unknown'],
    [{ self: {} }, 'worker@unknown'],
    [{}, 'unknown@unknown'],
    [{ Bun: { version: undefined } }, 'bun@unknown'],
    [{ Deno: { version: {} } }, 'deno@unknown'],
    [{ process: { versions: { node: '24.0.0\r\nSECRET' } } }, 'nodejs@unknown'],
  ])('uses safe unknown values where runtime details are unavailable', (globals, runtime) => {
    expect(metadataWithGlobals(globals)).toBe(
      `@polymarket/client@${version}:${runtime}`,
    );
  });

  it('does not request high entropy browser hints', () => {
    const getHighEntropyValues = vi.fn(() => {
      throw new Error('must not be called');
    });
    expect(
      metadataWithGlobals({
        window: {},
        navigator: {
          userAgent: 'Chrome/140.0.0.0',
          userAgentData: { getHighEntropyValues },
        },
      }),
    ).toBe(`@polymarket/client@${version}:chrome@140.0.0.0`);
    expect(getHighEntropyValues).not.toHaveBeenCalled();
  });

  it('cannot prevent client creation when a host blocks runtime inspection', () => {
    expect(
      metadataWithGlobals({
        navigator: {
          get userAgent() {
            throw new Error('restricted');
          },
        },
      }),
    ).toBe(`@polymarket/client@${version}:unknown@unknown`);
  });
});
