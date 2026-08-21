---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Adds the maker-side HTTP quote lifecycle: submitMakerQuote, cancelMakerQuote, and submitMakerConfirmation on the secure client, as the request/response alternative to the streaming quoter session. Quote identifiers are client-generated and returned from submitMakerQuote; last-look confirmation requests still arrive only over the streaming session, with submitMakerConfirmation as the response channel.
