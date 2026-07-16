---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Keep internal RFQ timeout classifications out of the known public error-code
enum. Unknown server codes remain forward compatible and continue to surface on
correlated RFQ operation errors without closing the session.
