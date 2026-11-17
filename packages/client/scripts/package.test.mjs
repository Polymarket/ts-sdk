import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { fixDeclarationExports } from './fix-declaration-exports.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.error ?? ''}${result.stdout}${result.stderr}`,
  );
  return result.stdout;
}

function json(path) {
  return readFile(path, 'utf8').then(JSON.parse);
}

test('restores aliases and external stars, preserves values and existing type exports', () => {
  const js = 'export { local as value, other as renamed } from "external";';
  const dts =
    'export * from "external"; export { local as value, other as renamed, Schema, type Already };';
  const fixed = fixDeclarationExports(js, dts);
  const source = ts.createSourceFile(
    'test.d.ts',
    fixed,
    ts.ScriptTarget.Latest,
    true,
  );
  assert.equal(source.statements[0].isTypeOnly, true);
  assert.deepEqual(
    source.statements[1].exportClause.elements.map((item) => item.isTypeOnly),
    [false, false, true, true],
  );
  assert.equal(fixDeclarationExports(js, fixed), fixed);
});

test('fails closed on unexpected runtime or declaration export formats', () => {
  for (const text of [
    'module.exports = { value: 1 };',
    'export {};',
    'export type { Value } from "external";',
    'export { type Value } from "external";',
    'export * from "external";',
    'export * as ns from "external";',
    'export const value = 1;',
    'export function value() {}',
    'export class Value {}',
    'export default 1;',
    'export {',
  ]) {
    assert.throws(() => fixDeclarationExports(text, 'export {};'));
  }
  for (const text of [
    'export * as ns from "external";',
    'export declare const value: number;',
    'export {',
  ]) {
    assert.throws(() => fixDeclarationExports('export { value };', text));
  }
});

test('installed tarballs support NodeNext and Bundler consumers across all six entries', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'polymarket-package-'));
  try {
    const installed = join(temporary, 'node_modules/@polymarket/client');
    await mkdir(dirname(installed), { recursive: true });
    // Materialize the locked dependency graph without registry metadata or
    // lifecycle scripts. Replace every SDK payload below with its packed bytes.
    run(
      'pnpm',
      [
        '--config.inject-workspace-packages=true',
        '--filter',
        '@polymarket/client',
        '--ignore-scripts',
        'deploy',
        '--offline',
        installed,
      ],
      root,
    );
    for (const name of ['types', 'bindings', 'client']) {
      const directory = join(root, 'packages', name);
      const manifest = await json(join(directory, 'package.json'));
      run(
        'pnpm',
        ['--dir', directory, 'pack', '--pack-destination', temporary],
        root,
      );
      const archive = join(
        temporary,
        `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`,
      );
      const files = run('tar', ['-tzf', archive], root).trim().split('\n');
      assert(
        files.every(
          (file) =>
            /^package\/(dist\/|package.json$|README.md$|LICENSE$)/.test(file) &&
            !file.split('/').includes('..'),
        ),
        files.join('\n'),
      );
      const target = await realpath(
        name === 'client'
          ? installed
          : join(installed, 'node_modules/@polymarket', name),
      );
      assert(target.startsWith(`${await realpath(temporary)}${sep}`));
      // Unlink old payloads before extraction; never overwrite possible
      // hardlinks to the workspace or shared store. Keep the installed graph.
      for (const entry of await readdir(target)) {
        if (entry !== 'node_modules')
          await rm(join(target, entry), { recursive: true, force: true });
      }
      run('tar', ['-xzf', archive, '--strip-components=1', '-C', target], root);
      assert.deepEqual(
        (await json(join(target, 'package.json'))).exports,
        manifest.exports,
      );
    }
    await writeFile(
      join(temporary, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    const manifest = await json(join(root, 'packages/client/package.json'));
    const compiler = join(installed, 'node_modules/typescript/bin/tsc');
    const cases = [
      ['', 'OrderSide', 'ApiKeySchema'],
      ['/actions', 'fetchOrderBook', 'FetchOrderBookRequest'],
      ['/node', 'builderApiKey', 'BuilderApiKeyCreds'],
      ['/ethers-v5', 'signerFrom'],
      ['/privy', 'signerFrom', 'PrivyWalletConfig'],
      ['/viem', 'privateKey', 'PrivateKeySignerOptions'],
    ];
    const positive = cases
      .map(
        ([entry, value, type], index) => `
import { ${value} as value${index} } from '@polymarket/client${entry}';
if (!value${index}) throw new Error('Missing runtime value');
${
  type
    ? `import type { ${type} as Type${index} } from '@polymarket/client${entry}';
export type Use${index} = ${type === 'ApiKeySchema' ? 'typeof ' : ''}Type${index};`
    : ''
}`,
      )
      .join('\n');
    const negative = cases
      .filter(([, , type]) => type)
      .map(
        ([entry, , type], index) => `
import { ${type} as Invalid${index} } from '@polymarket/client${entry}';
// @ts-expect-error type-only exports cannot be used as values
void Invalid${index};`,
      )
      .join('\n');
    for (const [extension, module, resolution] of [
      ['mts', 'NodeNext', 'NodeNext'],
      ['ts', 'ESNext', 'Bundler'],
    ]) {
      await writeFile(join(temporary, `valid.${extension}`), positive);
      await writeFile(join(temporary, `invalid.${extension}`), negative);
      const options = [
        '--module',
        module,
        '--moduleResolution',
        resolution,
        '--target',
        'ESNext',
        '--strict',
        '--skipLibCheck',
      ];
      run(
        process.execPath,
        [compiler, ...options, `valid.${extension}`],
        temporary,
      );
      run(
        process.execPath,
        [`valid.${extension === 'mts' ? 'mjs' : 'js'}`],
        temporary,
      );
      run(
        process.execPath,
        [compiler, ...options, '--noEmit', `invalid.${extension}`],
        temporary,
      );
    }
    // Every declared runtime export must remain usable as a TS value. Inspect
    // namespaces only inside this isolated consumer, never in the build fixer.
    await writeFile(
      join(temporary, 'inspect.mjs'),
      `
const entries = ${JSON.stringify(cases.map(([entry]) => entry))};
console.log(JSON.stringify(await Promise.all(entries.map(async entry =>
  [entry, Object.keys(await import('@polymarket/client' + entry))]))));`,
    );
    const runtime = run(process.execPath, ['inspect.mjs'], temporary);
    const coverage = [];
    for (const [index, [entry, names]] of JSON.parse(runtime).entries()) {
      // stripInternal deliberately omits some JS exports from the public DTS.
      const path = join(
        installed,
        manifest.exports[entry ? `.${entry}` : '.'].types,
      );
      const declaration = ts.createSourceFile(
        path,
        await readFile(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const declared = new Set(
        declaration.statements.flatMap((statement) =>
          ts.isExportDeclaration(statement) &&
          statement.exportClause &&
          ts.isNamedExports(statement.exportClause)
            ? statement.exportClause.elements.map(
                (element) => element.name.text,
              )
            : [],
        ),
      );
      coverage.push(
        `import * as Entry${index} from '@polymarket/client${entry}';`,
        ...names
          .filter((name) => declared.has(name))
          .map((name) => `void Entry${index}[${JSON.stringify(name)}];`),
      );
    }
    await writeFile(join(temporary, 'runtime.mts'), coverage.join('\n'));
    run(
      process.execPath,
      [
        compiler,
        'runtime.mts',
        '--module',
        'NodeNext',
        '--target',
        'ESNext',
        '--strict',
        '--skipLibCheck',
        '--noEmit',
      ],
      temporary,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
