# Anka room transport

`GameNetwork` now uses Anka HTTP + WebSocket room capabilities. PeerJS and public signaling are removed from the game runtime.

- A logged-in owner creates a two-seat room and receives a single-use invitation valid for ten minutes.
- The invite landing page exchanges the fragment credential for an HttpOnly visitor cookie valid for twenty-four hours. No long-lived credential is stored in JavaScript storage or URLs.
- Session storage keeps the last room ID. The authenticated current-room endpoint also resolves the room and stable player ID across pages.
- WebSocket hello verifies the compiled build ID and protocol. The server determines sender identity and restricts game event types by role.
- Room membership is independent of the mode. After the guest joins, the host chooses the mode and map. The server owns selections, readiness, loading acknowledgements and countdown. Each combat envelope is bound to the current round.
- Host sends `pvp-state`, `pvp-effect`, `pvp-finish`; guest sends `player` and `action`. Guest HP, ammunition and scores are never authoritative.
- Frames are bounded and the client avoids unbounded buffered sends. Periodic heartbeats measure round-trip time and server clock offset.
- The room pauses on disconnect and keeps both seats until session expiry. Reconnecting sockets can replace an old socket for the same authenticated player. A resumed guest receives a fresh snapshot before enabling input.
- Guests can reload and continue against the live host simulation. Opening a fresh host page keeps the same room and seats and returns an active round to the lobby.
- Kicking a player or closing a room revokes access immediately.

The separate invitation TTL never limits an already joined player's session. The owner can return to the lobby for rematches without redeeming a new invitation.

See `docs/ANKA-INTEGRATION.md` for setup and test commands, and Anka's `docs/ROOMS.md` for server contracts. Browser tests use isolated owner/visitor contexts and real WebSocket messages; they do not claim physical-phone or public-network certification.
