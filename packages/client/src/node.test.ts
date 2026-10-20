import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clientSourceDir = dirname(fileURLToPath(import.meta.url));
const nodeEntryUrl = pathToFileURL(resolve(clientSourceDir, 'node.ts'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('node entrypoint', () => {
  it('rejects browser-like runtimes during module evaluation', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});

    await expect(
      import(`${nodeEntryUrl.href}?browser=${Date.now()}`),
    ).rejects.toThrow(/browser-like runtime/i);
  });
});

it('keeps the platform secret adapter out of the browser-safe entrypoint', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});
  const browserSafe = await import('./index');
  expect(browserSafe).toHaveProperty('remotePlatformApiKey');
  expect(browserSafe).not.toHaveProperty('platformApiKey');
  await expect(
    import(`${nodeEntryUrl.href}?platform-browser=${Date.now()}`),
  ).rejects.toThrow(/browser-like runtime/i);
});
