import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';

const clientSourceDir = dirname(fileURLToPath(import.meta.url));
const nodeEntryUrl = pathToFileURL(resolve(clientSourceDir, 'node.ts'));

afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps platform secrets out of the browser entrypoint and rejects the Node entrypoint in browsers', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {});
  const browserSafe = await import('./index');
  expect(browserSafe).toHaveProperty('remotePlatformApiKey');
  expect(browserSafe).not.toHaveProperty('platformApiKey');
  await expect(
    import(`${nodeEntryUrl.href}?platform-browser=${Date.now()}`),
  ).rejects.toThrow(/browser-like runtime/i);
});
