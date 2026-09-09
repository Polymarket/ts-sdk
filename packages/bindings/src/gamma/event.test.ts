import { describe, expect, it } from 'vitest';
import { EventSchema, TeamOrdering } from './event';
import { ProtocolVersion } from './market';

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
});
