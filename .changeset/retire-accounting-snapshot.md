---
'@polymarket/client': minor
---

**Breaking:** Remove `downloadAccountingSnapshot` from public and secure clients and the standalone action, along with `DownloadAccountingSnapshotRequest`, `SecureDownloadAccountingSnapshotRequest`, and `DownloadAccountingSnapshotError`. The accounting snapshot route is scheduled for retirement with Data API v1 and has no V2 replacement. Remove calls to this download; the existing portfolio, position, and activity reads do not provide an equivalent ZIP/CSV export.
