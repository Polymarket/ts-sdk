---
"@polymarket/types": minor
---

Remove the `neverthrow` dependency, its public re-exports, and the legacy `unwrap`
helper. This is a breaking change in the 0.x release line: `Result`, `ResultAsync`,
and other `neverthrow` APIs must now be imported directly from an application's
own `neverthrow` dependency instead of `@polymarket/types`.

SDK service requests return promises. Return or await them directly instead of
wrapping them with `unwrap`; they resolve parsed response data. Select
`responseType: 'raw'` when a caller needs the raw response object.
