/* eslint-disable import/no-default-export */

import { defineConfig } from 'tsup';
import { lazyZodShapes } from '../../scripts/build/lazy-zod-shapes.mjs';
import { version } from './package.json';

const define = {
  __POLYMARKET_CLIENT_VERSION__: JSON.stringify(version),
};

export default defineConfig(() => [
  {
    define,
    entry: [
      'src/index.ts',
      'src/hmac.ts',
      'src/actions/index.ts',
      'src/ethers-v5.ts',
      'src/viem.ts',
    ],
    outDir: 'dist',
    sourcemap: true,
    treeshake: true,
    clean: true,
    tsconfig: 'tsconfig.build.json',
    bundle: true,
    minify: true,
    dts: true,
    platform: 'neutral',
    format: ['esm'],
    esbuildPlugins: [lazyZodShapes()],
  },
  {
    define,
    entry: ['src/node.ts', 'src/privy.ts'],
    outDir: 'dist',
    sourcemap: true,
    treeshake: true,
    clean: true,
    tsconfig: 'tsconfig.build.json',
    minify: true,
    dts: true,
    platform: 'node',
    format: ['esm'],
    esbuildPlugins: [lazyZodShapes()],
  },
]);
