import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  root: './',
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
