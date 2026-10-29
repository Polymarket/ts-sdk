// Verify the installed tarball's public surface, not the source/dev-loader graph.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [before, after, output] = process.argv.slice(2);

if (before === '--helper') {
  const consumer = resolve(after);
  const require = createRequire(`${consumer}/package.json`);
  const resolver = await import(pathToFileURL(`${consumer}/resolve.mjs`));
  const loaded = [];
  registerHooks({
    load(url, context, next) {
      loaded.push(url);
      return next(url, context);
    },
  });
  const helper = await import(resolver.resolve('@polymarket/client/hmac'));
  const helperModuleCount = loaded.length;
  const heavy = loaded.filter((url) =>
    /\/node_modules\/(zod|ox|viem|ethers-v5|@polymarket\/bindings)\//.test(url),
  );
  assert.deepEqual(
    heavy,
    [],
    'The HMAC entry must not load schemas or wallet/crypto libraries.',
  );
  assert.equal(
    await helper.buildHmacSignature('dGVzdA==', 1, 'GET', '/offline'),
    'XOQxvU9-ZJzQJkvFcNIHilnt9J5ENF_K4lyiXJe1yzw=',
  );
  const sdk = await import(resolver.resolve('@polymarket/client'));
  assert.equal(helper.buildHmacSignature, sdk.buildHmacSignature);
  assert.equal(
    require('@polymarket/client/hmac').buildHmacSignature,
    helper.buildHmacSignature,
  );
  process.stdout.write(
    `${JSON.stringify({ helperModules: helperModuleCount, heavyHelperModules: heavy.length, esmAndRequireIdentity: true })}\n`,
  );
} else {
  if (!before || !after || !output)
    throw new Error(
      'Usage: node scripts/memory/check-package.mjs BEFORE_CONSUMER AFTER_CONSUMER OUTPUT_JSON',
    );
  const probe = fileURLToPath(new URL('./probe.mjs', import.meta.url));
  const cases = [];
  for (const entry of [
    '@polymarket/client',
    '@polymarket/client/actions',
    '@polymarket/client/node',
  ]) {
    const values = [];
    for (const directory of [before, after]) {
      const consumer = resolve(directory);
      writeFileSync(
        `${consumer}/resolve.mjs`,
        'export function resolve(specifier) { return import.meta.resolve(specifier); }\n',
      );
      const child = spawnSync(
        process.execPath,
        ['--expose-gc', probe, consumer, entry, 'exports', 'esm'],
        { encoding: 'utf8', timeout: 60000 },
      );
      assert.equal(child.status, 0, child.stderr);
      values.push(JSON.parse(child.stdout).outputs.exports);
    }
    assert.deepEqual(
      values[1],
      values[0],
      `Existing exports changed for ${entry}`,
    );
    cases.push({ entry, exports: values[0].length, unchanged: true });
  }
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--helper', resolve(after)],
    { encoding: 'utf8', timeout: 60000 },
  );
  assert.equal(child.status, 0, child.stderr);
  const result = {
    before: resolve(before),
    after: resolve(after),
    cases,
    helper: JSON.parse(child.stdout),
  };
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
