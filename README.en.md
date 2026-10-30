# ANKA · Outpost Strike

[简体中文](README.md) | **English**

<img src="assets/branding/anka-logo-transparent.webp" width="112" alt="ANKA duo assault logo" />

A stylized 3D shooter built with **Vue 3, Three.js, and Vite**, with first- and third-person views, desktop controls, and phone / iPad touch support. Play solo in a standalone browser session or invite friends through the Anka plugin.

![ANKA Outpost Strike gameplay preview](image/README/1793031776170.webp)

## Features

| Area | Implemented functionality |
| --- | --- |
| Characters and views | Play as Xiao Jie or Xiao Kui; switch between first- and third-person views; animated weapon handling, aiming, movement, and jumping. |
| Maps and modes | Desert outpost, jungle ruins, snow fortress, and futuristic city; three-wave story battles with a boss, survival, AI companion co-op, and bot duels. |
| Weapons and combat | Seven weapon classes, reloads, recoil, muzzle flashes, tracers, and hit effects; grenades, medkits, shields, ground supplies, and companion revival. |
| Tactical AI | Behavior-tree decisions, cover, peek shooting, suppression, and flanking, with visibility / occlusion sensing and A* navigation. |
| Friend matches | Anka-authenticated two-player rooms, QR / link invitations, guest access without registration, ready checks, synchronized starts, scoring, respawns, and results. |
| Phones and iPad | Landscape controls, rotated portrait fallback, simultaneous movement / firing / aiming; drag any empty screen area to look around, compact health and score displays, and a top-right view switch. |
| UI and devices | Minimap, pause, quality and audio settings; controller pairing on desktop only, with no pairing entry on phones or iPad; a transparent duo logo in the game. |
| Assets and builds | Both characters retain 65 bones and 16 animation clips; Meshopt / WebP runtime assets and automatic Brotli / Gzip build output. |

**Duel rules:** 1 vs. 1; first to 10 points wins, or the higher score wins after 180 seconds. Equal scores result in a draw. Respawn after 3 seconds with 2 seconds of protection; firing ends protection early. Bot duels are available by default. Online matches currently support two-player PvP; co-op mode uses an AI companion.

## Quick start

### Requirements

- **Node.js 22.12+** and npm.
- **Git LFS** for models, FBX assets, and Blender source files.
- A WebGL 2-capable browser. Online rooms and device pairing additionally require the Anka host services.

From the project root:

```bash
git lfs install
git lfs pull
npm ci
npm run dev
```

- Game: <http://127.0.0.1:5173/>
- Character animation lab: <http://127.0.0.1:5173/characters.html>

Use the actual address printed in the terminal. The character lab provides individual / duo previews, 16 animation clips, front / rear views, and wireframe inspection.

### Build

```bash
npm run build
```

Output is written to `dist/`, including `build.json` and precompressed assets. The build completes in a staging directory before replacing the previous output. Neither `dist/` nor `node_modules/` is version-controlled.

The standalone development server supports solo play. Friend invitations, room synchronization, and device pairing require opening the game through Anka. See the [Anka integration guide](docs/ANKA-INTEGRATION.md) for installation, HTTPS / WSS, and deployment settings.

## Controls

### Desktop

| Action | Input |
| --- | --- |
| Move / sprint | `WASD` or arrow keys / left `Alt` |
| Fire / aim | Left mouse button or `J` / right mouse button |
| Look around | Click the first-person view to lock the pointer, then move the mouse; right-button dragging also rotates the view |
| Switch view / weapon | `V` / `1–7` or mouse wheel |
| Reload / jump / roll | `R` / `Space` / `Shift` |
| Crouch | Hold `C` |
| Grenade / medkit / shield | `G` / `E` / `Q` |
| Pick up / revive | `F`; supplies can also be collected by proximity or by clicking the prompt |
| Pause / resume | `Esc`; pausing releases pointer lock |

### Phones and iPad

Move with the bottom-left stick and drag any empty screen area to look around. Fire, aim, and action buttons sit on the right. Hold fire for continuous shooting; dragging the fire button also adjusts aim. Multi-touch is supported, and tapping the weapon selector opens the weapon list. The view switch is at the top right and is hidden while paused.

Starting a game attempts fullscreen and landscape orientation lock. A rotated layout is used when orientation lock is unavailable. Pausing, canceled touches, or orientation changes release held inputs. The controller-pairing component is not mounted on phones or iPad; desktop pairing uses Anka's device services.

## Development and validation

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Build the game and character lab |
| `npm run test:game` | Map waves, weapons, health, and core combat logic |
| `npm run test:duel` / `npm run test:ai` | Duel scoring, respawns, tactical AI, and navigation |
| `npm run test:online` | Online combat and synchronization logic |
| `npm run test:fps` / `npm run test:shots` | First-person supplies, muzzle projection, and shot effects |
| `npm run test:controller` | Device input routing, release, and control handover |
| `npm run test:models` / `npm run validate:aim` | Optimized models, animations, and skeleton validation |
| `npm run test:mobile` | Browser touch input, multi-touch, full-screen look regions, and rotated layouts |

For browser touch checks, first start `npm run dev` and install Chromium for Playwright:

```bash
npx playwright install chromium
npm run test:mobile
```

Set `ANKA_QA_URL` to use another development URL, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium installation. Real-room end-to-end checks are documented in the [integration guide](docs/ANKA-INTEGRATION.md); model visual and transfer checks are in the [asset optimization guide](docs/ASSET-OPTIMIZATION.md). Reports are generally written to `reports/`. Browser device emulation is not equivalent to physical iOS / Android device acceptance testing.

## Project structure

```text
├── game/                   # Vue UI, game loop, characters, combat, and input
│   ├── engine.js           # Scene and gameplay orchestration
│   ├── duel-brain.js       # Tactical AI; adjacent modules implement trees and navigation
│   ├── network.js          # Anka rooms and WebSocket transport
│   └── mobile.css          # Phone / iPad layout
├── assets/
│   ├── characters/         # Runtime models and Tripo / Mixamo assets
│   └── branding/           # Transparent logo, navy app icon, and design variants
├── demo/                   # Character animation lab
├── server/                 # Anka backend definitions
├── web/                    # Anka host entry point
├── source/                 # Editable Blender sources and model backups
├── scripts/                # Build, asset processing, and validation tools
├── docs/                   # Integration, gameplay, and optimization guides
└── reports/                # Model, animation, test, and production records
```

## Assets and technical documentation

The detailed guides below are currently written in Chinese.

- [Anka installation, invitations, and deployment](docs/ANKA-INTEGRATION.md)
- [Model and transfer optimization](docs/ASSET-OPTIMIZATION.md)
- [Behavior-tree design and limitations](reports/game/behavior-tree.md)
- [Mixamo animation retargeting](reports/mixamo/README.md)
- [Tripo production costs and task records](reports/tripo/cost-report.md)
- [Logo and application icon assets](assets/branding/README.md): the game uses the transparent version; the navy-background original is retained for a future Anka app icon.
- Historical gameplay notes: [1.1](docs/GAMEPLAY-1.1.md) · [1.2](docs/GAMEPLAY-1.2.md)

Both the game and character lab load `assets/characters/optimized/`. Original Tripo / Mixamo models and Blender files are retained separately; the older five-clip assets do not represent the full runtime animation set. Environments and robots use procedural low-poly art. The current version targets solo play and friend matches, with host-authoritative online combat.
