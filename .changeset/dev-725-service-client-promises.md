---
"@polymarket/client": minor
---

Refactor service-client requests to promises that resolve to response data and
reject with existing SDK errors. Schema-based JSON requests validate, transform,
and infer their output; unchecked generic calls retain their declared type, and
calls with neither schema nor a generic return `unknown`.

Add a reserved, unconfigured `predictions: ServiceClient` getter to public and
secure clients for future polymarket.com UI use. It has no root or transport;
requests reject with `UserInputError` before any fetch. The getter is
experimental and may change in a breaking way even in patch releases. Existing
service getters, routes, authentication, and high-level actions remain unchanged.

Preserve request authentication, headers, custom fetch, rate-limit reporting,
retry opt-out, and per-operation cancellation through response consumption.
Support JSON, Blob, ArrayBuffer, text, empty, and raw response modes; raw
responses keep the request signal while the caller owns later body reads.
High-level action results and existing pagination and recovery behavior remain
unchanged.

Client internals compose promises directly. The companion types-package
changeset removes the legacy `neverthrow` re-exports and `unwrap` helper.
