Captured from the internal staging WebSocket edge on 2026-09-08. Frames are unmodified; no credentials were captured. The public edge rejected this machine's upgrade.

The `capture-auth` acknowledgment was captured separately with public dummy credentials in shadow-auth mode. It pins the acknowledgment format, not credential enforcement. The integration protocol suite also verifies authentication using the secure client's credentials.

Live crypto (btcusd, ethusd), equity (aapl), and 60-second TWAP were available. The TWAP full_accuracy_value is a decimal string, not an E18 integer. The 30-second window, btcusdt, and the test BBO asset returned empty barriers. No dropped envelope or auth_required rejection could be elicited in staging shadow authentication mode. Deterministic malformed/precision cases are explicitly synthetic tests, not captured frames. Full live coverage remains a release gate.
