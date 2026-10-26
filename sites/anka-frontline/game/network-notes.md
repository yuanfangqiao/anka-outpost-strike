# ANKA WebRTC room transport

`game/network.js` exports `GameNetwork`. It dynamically imports `peerjs` only when the player creates or joins a room. It does not import a renderer, touch the DOM, start a server, use account credentials, or switch to AI when networking fails.

## Integration API

```js
import { GameNetwork } from './network.js';

const network = new GameNetwork({
  onEvent(payload, peerId) {
    // Host: receive a guest's inputs/events.
    // Guest: receive authoritative events/snapshots from the host.
  },
  onStatus(status) {
    // { state, code, peers, members, localId, isHost, mode, error, errorCode }
    // Show errors and disconnected states honestly in the lobby/game UI.
  },
});

const { code, id } = await network.host('coop'); // 'pvp' also works
// Another browser/device:
// const { code, id } = await network.join('ABC234');

network.send({ type: 'input', x: 1, z: 0 });
if (network.isHost) network.broadcast({ type: 'snapshot', tick: 1, players: [] });
// Optional exclusion: network.broadcast(payload, senderPeerId).

network.close(); // Call when leaving multiplayer or destroying the game.
```

Getters:

- `isHost`: this instance owns the room.
- `connected`: the host has working signaling or existing data channels; a guest has received a valid welcome and its host channel is open.
- `peerCount`: **total room players including this browser**. `1` means a host waiting for guests, `2–4` means a joined room. It is zero before entry or after the session closes.
- `localId`: PeerJS ID for this browser, empty before signaling opens.
- `roomCode`: six-character, case-insensitive share code. `anka-` is accepted as an optional pasted prefix.
- `mode`: the host-selected mode, supplied to guests by the welcome handshake.

`send` returns a sent-connection count: a guest sends only to the host; a host sends to all ready guests. `broadcast` is host-only and supports `exceptId`. The SDK deliberately does not relay guest business messages automatically; the host's game logic decides what to accept and broadcast.

## Room protocol and lifecycle

Room host peer IDs are `anka-<six random characters>`. Guest peer IDs use an independent `anka-player-...` ID. The room allows one host plus three guests. An incoming data channel reserves a seat while it negotiates; a fifth player receives a readable room-full rejection. Public PeerServer IDs can collide, so the rare ID-collision error asks the user to create a new room. [PeerServer Cloud](https://peerjs.com/server/cloud)

`host()` resolves once the public signaling service assigns the host ID. `join()` resolves only after the guest receives and validates the host's `welcome` control message, including room code, guest ID and member list. Business events are wrapped separately, so callers may use their own `payload.type` names freely. Data channels use PeerJS JSON serialization and reliable delivery. The official APIs provide connection open/data/error/close events and the underlying `RTCPeerConnection`. [Peer API](https://peerjs.com/client/api/peer), [DataConnection API](https://peerjs.com/client/api/data-connection)

Status states are `hosting`, `joining`, `connected`, `disconnected`, `error`, `closed`. During initial host registration, `hosting` has zero players; after host registration it has one. When guests leave, the host returns to `hosting` with one player. A guest losing its host disconnects rather than pretending the room is still running. `members` is the complete current list of peer IDs, useful for removing disconnected player avatars.

The whole create/join operation has a 30-second deadline. Each pending inbound channel also has a 30-second deadline. An established WebRTC channel in `failed`/`closed` state is dropped; a transient `disconnected` state gets a 10-second recovery window. Every timeout, connection listener, transport listener and pending rejection is cleaned on close. `peer.destroy()` cleans PeerJS's own resources. Losing only signaling does not discard a still-working P2P channel; the status contains an error explaining that new players may not be able to join. [Peer connection and cleanup behavior](https://peerjs.com/client/api/peer)

## Messages and backpressure

- Payloads must contain plain JSON: finite numbers, strings, booleans, null, arrays and ordinary objects. Convert Three.js vectors to arrays or plain coordinate objects.
- Payload maximum is 48 KiB UTF-8; envelopes are limited to 64 KiB. Excessive nesting, oversized strings/arrays, functions, circular references and prototype-related keys are rejected.
- Use small authoritative snapshots at roughly 10–20 Hz. A channel with over 256 KiB of buffered data or over 32 queued messages returns `0` for that send instead of accumulating an unbounded stream. The next game tick can send a fresh snapshot.
- The SDK does not validate gameplay authority or implement anti-cheat. Positions, combat, enemies, inventory, damage and match rules remain the host game controller's responsibility.

## Public service and NAT limitations

Omitting custom `host` and `key` uses the free, shared PeerServer Cloud for signaling; this implementation explicitly requests a secure connection and does not require a developer API key. A large production audience should use a controlled signaling deployment rather than rely on a shared public service. [Official PeerServer Cloud documentation](https://peerjs.com/server/cloud)

After signaling, this is a real WebRTC data channel between browsers, not a simulated multiplayer mode. Public signaling availability, firewalls and NAT traversal can still fail. In particular, symmetric NATs or restrictive networks may need a TURN relay; the wrapper does not supply a private TURN service or promise universal connectivity. PeerJS's default signaling service uses port 443. Network failure remains visible and never silently becomes an AI opponent. [Official PeerJS FAQ](https://peerjs.com/client/faq), [Peer configuration reference](https://peerjs.com/client/api/peer)

## Verification performed here

- `node --check game/network.js` passed.
- A deterministic in-memory Peer test double exercised welcome-gated joining, four-player capacity, host/guest delivery, broadcast exclusion, member cleanup, continued P2P after signaling loss, payload rejection, cancellation, connect timeout, ICE disconnect and complete timer cleanup. All passed.
- This protocol test does **not** establish real WebRTC reachability. Actual two-browser/device testing against PeerServer Cloud is still needed in the game QA flow; do not report the test double as a successful public-network connection.
