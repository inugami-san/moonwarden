# Moonwarden

Moonwarden is a polished single-room social deduction playtest set in an ancient
mountain sanctuary above the Silverpine forest. It runs entirely in the browser
with a procedurally rendered 2D Canvas world and autonomous AI wardens.

## Included gameplay

- Four to eight players with exactly one privately assigned Impostor
- Forced Crewmate, forced Impostor, and random role test modes
- Cinematic private role reveals for both Wardens and the Impostor
- Fifteen-second Calm, three-second warning, and ten-second Ordeal phases
- Five rotating Ordeals: Total Blackout, Thick Sea Fog, Moon Glare, Rootwake's six-cell grid that traps each player inside their current chamber and hides the other five, and Phantom Procession decoys that Sonar can expose
- Task-earned flashlight cones, five-second flares, and proximity sonar, with clear reward notices
- Forest sanctums with mossy stone, living roots, fireflies, and flowers; available, sealed, and Ordeal-locked visual states
- Sanctums reopen each round (the next Calm, including after meetings), preserving earned gear and shared task progress; successful tasks emit a small 0.5-second completion pulse in solo and multiplayer
- One completion per sanctum per round, shared Crew seals, and deceptive Impostor tasks; delayed task requests from older rounds are rejected
- Quick arithmetic and constellation-link shrine puzzles, including fake Impostor versions
- One Impostor strike per Ordeal with a compact, non-blocking top kill notice (no public identity reveal), private Impostor Moon Sight, jelly puddles, reporting, emergency meetings, voting,
  ejection, task victory, and parity victory
- Phase-aware background music that crossfades between the gentle normal-flow theme and hostile Ordeal theme, preserving each track's position with an in-game BGM toggle
- Living-player meeting chat with contextual AI discussion for the local playtest
- Private death reveal identifying the killer before the eliminated player spectates
- AI navigation, task work, hunting, item use, body discovery, self-reporting,
  and weighted voting
- Responsive keyboard, mouse, and touch controls
- **Multiplayer**: WebSocket transport with an HTTP relay fallback, 4-letter room codes, unique room-wide slime colors (including bots), waiting room chat and roster, host controls, a 20Hz room tick, buffered movement interpolation, and synchronized voting
- Cached translucent slime materials with subdued pigments, soft moonlight reflections, subtle eyes, and restrained fluid motion; identity-concealing Ordeals retain anonymous silhouettes

## Run locally

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` in your browser.

### Multiplayer
To play multiplayer with friends or across multiple browser tabs:
1. Open the lobby's **✦ MULTIPLAYER** mode (selected by default).
2. Customize your warden nickname, slime color, and hat.
3. Click **CREATE ROOM** to generate a 4-letter room code (or enter a friend's code and click **JOIN**).
4. As the host, choose your target party size (4–8 slots) and whether to fill empty slots with AI bots, then click **START MATCH**.

A standalone WebSocket server is also available via:
```bash
npm run ws # runs WebSocket server on port 3001
```

### Persistent room server (Vercel frontend + Render playtest backend)

`render.yaml` describes a **free, single-instance** Node room service in Singapore.
It uses `npm ci --omit=dev`, `npm run ws`, and `/health`. The server respects the
host's `PORT`, has protocol-level heartbeats for background tabs, limits packet
size, and closes connections clearly on restart. `WS_ALLOWED_ORIGINS` controls
the allowed frontend origins, including CORS for the wake-up health check.

The deployed room server is `wss://moonwarden-rooms.onrender.com/ws`, built from
`codex/persistent-room-server` in GitHub. Production `NEXT_PUBLIC_WS_URL` on the
Vercel project serving **moonwarden-two.vercel.app** points to this address.
Rebuild and deploy the frontend whenever this public URL changes. The site is currently released directly
through the Vercel CLI; pushing GitHub alone does not update this site's deployment.
The Render room service still needs its source code published to its configured Git
branch. Keep backend auto-deployment off to avoid interrupting active matches.
The allowed frontend origins include `moonwarden-two.vercel.app`, its
`moonwarden-christainj.vercel.app` alias, and the previous `moonwarden-pi.vercel.app`
site. The client waits up to 80 seconds for `/health` before
opening the socket; failures never fall back to unrelated HTTP rooms.

Free Render services sleep after inactivity and can take about a minute to wake.
Rooms are live only while that single process is running: restarting, redeploying,
or sleeping clears them. Do not scale beyond one instance without shared room
storage/coordination. Do not promise an always-on or restart-resilient service on
the free plan. Backend auto-deployment is off so releases can be coordinated
outside active matches. See [Render's free-service limits](https://render.com/docs/free).

Run `npm run test:ws` to exercise health, origin checks, and three actual WebSocket
clients discovering a room, joining, starting a match, and receiving movement.

### Current Vercel setup and latency

Without `NEXT_PUBLIC_WS_URL`, a `*.vercel.app` frontend uses `/api/mp` HTTP polling.
The HUD identifies this as **HTTP RELAY** and shows the measured request round-trip
time. The client keeps local movement responsive, buffers remote snapshots, caps
prediction after missing updates, and coalesces queued positions. Movement packets
omit profiles; world snapshots run at 5Hz, with immediate gameplay events. Failed
HTTP requests retry by request ID to avoid duplicate actions.
Inactive relay sessions have a two-minute grace period for background-tab
throttling. Lost connections now stop polling, disable stale waiting-room controls,
show errors inside the room, and offer a return-to-lobby recovery action.

The relay and room registry currently live in process memory. They are suitable
for local testing on one process, but do not provide shared or durable rooms across
Vercel instances. A missing session now produces an explicit reconnect message
instead of leaving a match silently frozen. Client smoothing cannot eliminate
round-trip latency or fix this hosting limitation.

For reliable production rooms, keep this frontend and use either a persistent
room service (`npm run ws`, with `NEXT_PUBLIC_WS_URL=wss://your-room-service` set
before building the frontend), or add shared room storage and coordination to a
Vercel-native realtime backend. Vercel's WebSocket support alone does not share
in-memory rooms between connections or deployments. See
[Vercel's persistent-state guidance](https://vercel.com/docs/functions/websockets#manage-persistent-state).
When an external WebSocket URL is configured, a failed connection reports the
failure rather than silently moving that player into an unrelated HTTP room.

The local preview also gives the game WebSocket route exclusive upgrade handling
so the Worker preview does not close an already-connected game socket.

Deploy the updated frontend and room server together when changing the protocol.
No deployment is performed by the local checks below.

## Controls

| Action | Control |
| --- | --- |
| Move | `WASD` or arrow keys |
| Aim | Mouse |
| Work a moon shrine | Press or hold `E` |
| Select gear | `1`, `2`, `3` |
| Use gear | `F` or right-click |
| Report / emergency | `R` |
| Impostor kill | `Q` or `Space` |
| Impostor Moon Sight | `V` |

## Verify

```bash
npm run build
npm test
node --import tsx --test tests/multiplayer.test.mjs tests/movement.test.mjs tests/network.test.mjs
```

The app uses the bundled vinext/Vite runtime and is compatible with the Sites
hosting target declared in `.openai/hosting.json`.
