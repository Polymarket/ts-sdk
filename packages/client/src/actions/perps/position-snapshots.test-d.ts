import { expectTypeOf, it } from 'vitest';
import {
  createPublicClient,
  type PerpsPositionSnapshot,
  PerpsPositionSnapshotStatus,
  type PerpsPositionSnapshots,
  type PerpsSession,
} from '../../index';

it('exposes precise public batch results and owner selections', () => {
  const client = createPublicClient();
  function read(session: PerpsSession) {
    expectTypeOf(
      client.fetchPerpsPositionSnapshots({
        address: '0x1111111111111111111111111111111111111111',
        activeInstrumentIds: [7],
      }),
    ).toEqualTypeOf<Promise<PerpsPositionSnapshots>>();
    expectTypeOf(
      session.fetchPositionSnapshots({
        historyFills: [
          { instrumentId: 7, tradeId: '18446744073709551615', timestamp: 0 },
        ],
      }),
    ).toEqualTypeOf<Promise<PerpsPositionSnapshots>>();
    void session.fetchPositionSnapshots({
      // @ts-expect-error Owner reads do not accept an address override.
      address: 'other',
      activeInstrumentIds: [7],
    });
  }
  function inspect(snapshots: PerpsPositionSnapshots) {
    for (const item of snapshots.history) {
      expectTypeOf(item.tradeId).toEqualTypeOf<string>();
      if (item.status === PerpsPositionSnapshotStatus.Ok) {
        expectTypeOf(item.snapshot).toEqualTypeOf<PerpsPositionSnapshot>();
      } else {
        // @ts-expect-error Failed selections have no snapshot.
        void item.snapshot;
      }
    }
  }
  void read;
  void inspect;
});
