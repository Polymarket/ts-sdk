import { describe, expect, it } from 'vitest';
import {
  EventSchema,
  ListSportsMetadataResponseSchema,
  TeamOrdering,
} from './event';
import { ProtocolVersion } from './market';

const rawSport = {
  id: 1,
  sport: 'nfl',
  image: '',
  resolution: '',
  ordering: '1',
  tags: '1',
  series: '1',
};

describe('ListSportsMetadataResponseSchema', () => {
  it('preserves the sport name without changing the sport code', () => {
    const sports = ListSportsMetadataResponseSchema.parse([
      { ...rawSport, name: 'National Football League' },
    ]);

    expect(sports[0]?.name).toBe('National Football League');
    expect(sports[0]?.sport).toBe('nfl');
  });

  it('keeps sport names nullish when absent', () => {
    const sports = ListSportsMetadataResponseSchema.parse([
      rawSport,
      { ...rawSport, name: null },
    ]);

    expect(sports.map((sport) => sport.name)).toEqual([undefined, null]);
  });
});

describe('EventSchema', () => {
  it('exposes the protocol version shared by its markets', () => {
    const event = EventSchema.parse({
      id: '570555',
      version: ProtocolVersion.V2,
    });

    expect(event.version).toBe(ProtocolVersion.V2);
  });

  it('exposes parentEventId as a string event id', () => {
    const event = EventSchema.parse({
      id: '570555',
      parentEventId: 570146,
    });

    expect(event.parentEventId).toBe('570146');
  });

  it('keeps parentEventId nullish when absent', () => {
    expect(EventSchema.parse({ id: '570146' }).parentEventId).toBeUndefined();
    expect(
      EventSchema.parse({ id: '570146', parentEventId: null }).parentEventId,
    ).toBeNull();
  });

  it('preserves typed team ordering', () => {
    const event = EventSchema.parse({
      id: '570146',
      teams: [
        { id: 114315, ordering: 'home' },
        { id: 114317, ordering: 'away' },
      ],
    });

    expect(event.sports.teams.map((team) => team.ordering)).toEqual([
      TeamOrdering.Home,
      TeamOrdering.Away,
    ]);
  });

  it('preserves the nested sport name without changing the sport code', () => {
    const event = EventSchema.parse({
      id: '570146',
      sport: { ...rawSport, name: 'National Football League' },
    });

    expect(event.sports.sport?.name).toBe('National Football League');
    expect(event.sports.sport?.sport).toBe('nfl');
  });
});
