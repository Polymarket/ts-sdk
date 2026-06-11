/* eslint-disable import/no-default-export */

import { defineConfig } from 'tsup';

export default defineConfig(() => [
  {
    entry: [
      'src/index.ts',
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
  },
  {
    entry: ['src/node.ts', 'src/openfort.ts', 'src/privy.ts'],
    outDir: 'dist',
    sourcemap: true,
    treeshake: true,
    clean: true,
    tsconfig: 'tsconfig.build.json',
    minify: true,
    dts: true,
    platform: 'node',
    format: ['esm'],
  },
]);
