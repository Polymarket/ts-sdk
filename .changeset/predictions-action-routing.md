---
'@polymarket/client': minor
---

Use the configured Predictions endpoint for supported discovery, trading, portfolio and wallet actions, including wallet-wide order listing and cancellation. API keys sign only the operations of their credential family, against the upstream method and path. Keyset comments use the gateway cursor envelope. Offset comment filters and order heartbeats keep their direct endpoints.

**Breaking:** `EnvironmentConfigFork` no longer accepts `data`, `relayer`, `combos.rest`, `combos.builderGateway` or `combos.collateralReturn`, and the `CombosEndpoints` type is removed. Those endpoints no longer served any action. Point `predictions.rest` at the environment's gateway instead. `combos` keeps the quoter socket (`ws` and `headers`), `clob` keeps order heartbeats and the market and user sockets, and `gamma` keeps offset comment reads.
