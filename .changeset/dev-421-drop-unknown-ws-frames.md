---
"@polymarket/client": patch
---

Drop unknown WebSocket frames without closing the connection. Frames that fail to parse — new frame types, malformed known frames, or known frames carrying values the SDK does not model — are silently discarded on every stream, and subsequent events keep flowing. In particular, the RFQ quoter session no longer fails with `TransportError` on an unrecognized or unreadable frame: the frame is dropped, the session stays open, and a caller waiting on an unreadable acknowledgement fails through its acknowledgement timeout. Well-formed but uncorrelated RFQ errors still fail the session.
