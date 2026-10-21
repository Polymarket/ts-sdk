---
'@polymarket/client': minor
---

**Breaking:** Remove `downloadAccountingSnapshot` from public and secure clients and the standalone action, along with `DownloadAccountingSnapshotRequest`, `SecureDownloadAccountingSnapshotRequest`, and `DownloadAccountingSnapshotError`. The accounting snapshot route retires with Data API v1 on October 24, 2026 and has no V2 replacement. Remove calls to this download; the existing portfolio, position, and activity reads do not provide an equivalent ZIP/CSV export. This removal requires a minor release while the SDK is on 0.x.
