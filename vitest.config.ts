import { configDefaults, defineConfig } from 'vitest/config';
import { transformLazyZodShapes } from './scripts/build/lazy-zod-shapes.mjs';

// Tests run the same lazy Zod shape rewrite that the package builds emit.
const SDK_SOURCE =
  /[\\/]packages[\\/](bindings|client)[\\/]src[\\/].*(?<!\.test(-d)?)\.ts$/;

export default defineConfig({
  root: './',
  plugins: [
    {
      name: 'lazy-zod-shapes',
      enforce: 'pre',
      transform(code, id) {
        if (!SDK_SOURCE.test(id) || !code.includes("from 'zod'"))
          return undefined;
        return { code: transformLazyZodShapes(code, id), map: null };
      },
    },
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'bindings',
          include: ['packages/bindings/**/*.test.ts'],
          exclude: [...configDefaults.exclude],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'types',
          include: ['packages/types/**/*.test.ts'],
          exclude: [...configDefaults.exclude],
          environment: 'node',
          typecheck: {
            enabled: true,
            include: ['packages/types/**/*.test-d.ts'],
            tsconfig: 'packages/types/tsconfig.json',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          include: ['packages/client/src/**/*.test.ts'],
          exclude: [...configDefaults.exclude],
          environment: 'node',
          testTimeout: 10_000,
          typecheck: {
            enabled: true,
            include: ['packages/client/**/*.test-d.ts'],
            tsconfig: 'packages/client/tsconfig.json',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'client-integration',
          include: ['packages/client/tests/integration/**/*.test.ts'],
          exclude: [...configDefaults.exclude],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
