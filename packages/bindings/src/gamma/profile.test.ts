import { describe, expect, it } from 'vitest';
import { PublicProfileSchema } from './profile';

describe('PublicProfileSchema fee tier metadata', () => {
  it.each([
    { takerTier: 0, takerTierName: '', weightedVolume: 0 },
    { takerTier: 2, takerTierName: 'Tier 2', weightedVolume: 1234.5 },
  ])('preserves tier and numeric weighted volume: %j', (metadata) => {
    expect(PublicProfileSchema.parse(metadata)).toMatchObject(metadata);
  });

  it('keeps metadata absent on older responses', () => {
    const profile = PublicProfileSchema.parse({ name: 'Example' });
    expect(profile.takerTier).toBeUndefined();
    expect(profile.takerTierName).toBeUndefined();
    expect(profile.weightedVolume).toBeUndefined();
  });

  it.each([
    { takerTier: null },
    { takerTierName: null },
    { weightedVolume: null },
    { takerTier: 1.5 },
    { takerTier: '2' },
    { weightedVolume: '12.5' },
    { takerTierName: 2 },
  ])('rejects metadata outside the served field types: %j', (metadata) => {
    expect(PublicProfileSchema.safeParse(metadata).success).toBe(false);
  });
});
