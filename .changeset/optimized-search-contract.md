---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Accept search market summaries without identifiers and preserve top-level continuation metadata. SearchResults.events now contains SearchEvent values with SearchMarket entries whose id is optional; callers must check id before using a summary as an identified market. Full market responses continue to require identifiers.
