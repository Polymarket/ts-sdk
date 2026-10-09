---
"@polymarket/client": minor
---

Refactor service-client requests to promises that resolve to response data and
reject with existing SDK errors. Schema-based JSON requests validate, transform,
and infer their output; unchecked generic calls retain their declared type, and
calls with neither schema nor a generic return `unknown`.

Add `predictions: ServiceClient` to public and secure clients for polymarket.com
UI requests, configured to `https://api.defi.polymarket.com` in production.
Environment forks can override its root and headers. Requests use the same
Promise interface: GET query parameters use `params: URLSearchParams`; POST
bodies use `json`, with request controls and an optional response schema in the
same flat object. Existing trading credentials are not attached to prediction
requests; callers supply any gateway-required request headers. The getter is
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
