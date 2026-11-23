import { describe, expect, it } from 'vitest';
import {
  type EnvironmentConfigFork,
  forkEnvironmentConfig,
} from './environments';
import { UserInputError } from './errors';

describe('forkEnvironmentConfig', () => {
  it('rejects removed REST endpoint overrides instead of ignoring them', () => {
    const fork = {
      name: 'removed-endpoints',
      gamma: { rest: 'https://gamma.example' },
      clob: { rest: 'https://clob.example' },
      combos: { builderGateway: { rest: 'https://builder.example' } },
    };

    expect(() => forkEnvironmentConfig(fork as EnvironmentConfigFork)).toThrow(
      new UserInputError(
        "Removed environment endpoints: gamma, clob.rest, combos.builderGateway. Every REST operation uses `predictions.rest`; point it at the environment's gateway instead.",
      ),
    );
  });
});
