# Anka room transport

`GameNetwork` now uses Anka HTTP + WebSocket room capabilities. PeerJS and public signaling are removed from the game runtime.

- A logged-in owner creates a two-seat room and receives a single-use invitation valid for ten minutes.
- The invite landing page exchanges the fragment credential for an HttpOnly visitor cookie valid for twenty-four hours. No long-lived credential is stored in JavaScript storage or URLs.
- Session storage keeps only the last public room ID for same-tab owner refresh. It does not grant room access.
- WebSocket hello verifies the compiled build ID and protocol. The server determines sender identity and restricts game event types by role.
- Lobby selections, readiness, loading acknowledgements, countdown and membership are server-owned. Each combat envelope is bound to the current round.
- Host sends `pvp-state`, `pvp-effect`, `pvp-finish`; guest sends `player` and `action`. Guest HP, ammunition and scores are never authoritative.
- Frames are bounded and the client avoids unbounded buffered sends. Periodic heartbeats measure round-trip time and server clock offset.
- Transient disconnect reconnects automatically. A new page with no matching live simulation returns both players to the lobby; its valid visitor cookie is retained.
- A kicked player or a closed room loses access immediately. Closing the iframe disconnects transport and starts the server's thirty-second grace period.

The separate invitation TTL never limits an already joined player's session. The owner can return to the lobby for rematches without redeeming a new invitation.

See `docs/ANKA-INTEGRATION.md` for setup and test commands, and Anka's `docs/ROOMS.md` for server contracts. Browser tests use isolated owner/visitor contexts and real WebSocket messages; they do not claim physical-phone or public-network certification.
