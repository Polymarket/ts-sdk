/* eslint-disable import/no-default-export */

import { defineConfig } from 'tsup';
import { lazyZodShapes } from '../../scripts/build/lazy-zod-shapes.mjs';

export default defineConfig(() => ({
  entry: [
    'src/index.ts',
    'src/clob/index.ts',
    'src/combos/index.ts',
    'src/data/index.ts',
    'src/gamma/index.ts',
    'src/perps/index.ts',
    'src/relayer/index.ts',
    'src/subscriptions/index.ts',
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
}));
