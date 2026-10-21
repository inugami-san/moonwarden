# Moonwarden

Moonwarden is a social deduction playtest set in an ancient mountain sanctuary
within the Silverpine forest. It runs in the browser with a procedurally rendered
2D Canvas world, multiplayer rooms, and autonomous AI wardens.

## Included gameplay

- Four to eight players with exactly one privately assigned Impostor
- Forced Crewmate, forced Impostor, and random role test modes
- Cinematic private role reveals for both Wardens and the Impostor
- Twenty-four-second Calm, three-second warning, and ten-second Ordeal phases; Mirror Pool lasts twenty-five seconds
- Six rotating Ordeals: Total Blackout, Thick Sea Fog, Moon Glare, Rootwake's six-cell grid, Phantom Procession decoys that Sonar can expose, and Mirror Pool's reversed controls and contact-triggered color swaps
- A shared 1920×1140 forest with connected clearings and a responsive following camera; slimes, shrines, and collision props retain their readable sizes
- A collapsible minimap and expanded map (`M` or the map button) showing only your position, static landmarks, and shrine rewards—not players, bodies, roles, or sound cues
- Task-earned Glowing Mushrooms, five-second Moonblossoms, and Echo Bells, with clear reward notices
- Forest sanctums with mossy stone, living roots, fireflies, and flowers; personal reward availability and shared restoration have separate visual states
- Sanctums reopen each round (the next Calm, including after meetings), preserving earned gear and shared task progress; successful tasks emit a small 0.5-second completion pulse in solo and multiplayer
- One personal ritual per player, sanctum, and round; a teammate's shared seal never removes your gear reward. Only the first real Warden completion adds team progress; deceptive Impostor tasks do not. Delayed requests from older rounds are rejected
- Quick arithmetic and constellation-link shrine puzzles, including fake Impostor versions
- One Impostor strike per Ordeal with a compact, non-blocking top kill notice (no public identity reveal), private Impostor Moon Sight, jelly puddles, reporting, emergency meetings, voting,
  ejection, task victory, and parity victory
- Phase-aware background music that crossfades between the gentle normal-flow theme and hostile Ordeal theme, preserving each track's position with an in-game BGM toggle
- Living-player meeting chat with contextual AI discussion for the local playtest
- Private death reveal identifying the killer before the eliminated player spectates
- AI navigation to actual shrines, on-site ritual dwell, hunting, earned item use, body discovery, self-reporting,
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

Before creating or joining a room, both WebSocket and HTTP connections verify
the shared `GAME_WORLD_VERSION`. An older room server cannot silently apply old
map boundaries or invisible obstacle positions to a newer client: the lobby
shows an update/reconnect error instead. A listening socket or a successful
health response alone is not enough to start multiplayer. For local testing,
`npm run dev` serves the matching game socket at `/api/ws`; if overriding it with
`NEXT_PUBLIC_WS_URL`, run the room server from this same source revision. Bump
the world version when changing incompatible map geometry or shared game state.
Trunk collisions keep their solid bases but preserve tangential movement, so
glancing alongside a tree no longer damps both movement axes and feels sticky.

Deploy the updated frontend and room server together when changing the protocol.
No deployment is performed by the local checks below.

## Controls

### Expanded forest and Warden preparation

Create Room and Join With Code are the primary entry actions; a name is visible
up front and wardrobe customization is optional. The expanded Silverpine Moon
Glade uses a shared **1920×1140 world**, six distinct clearings, and wide connected
paths. Geometry, station positions, Rootwake cells, and collision obstacles come
from `server/sanctuary-map.ts`, shared by the browser and room server. The
backdrop is baked once at its real world size. A following camera fills the
canvas's actual aspect ratio, including portrait phones, instead of shrinking
the entire forest to fit. Reduced motion snaps to the camera target without
decorative camera easing.

Use **M** or the on-screen map button to expand the navigation map; its minimap
can also be collapsed. The map shows your own position, named clearings, shrine
locations, personal reward state, and a selected destination. It never accepts
or displays a player roster, bodies, roles, footsteps, or lure positions. A
destination bearing is not a guaranteed obstacle-free path. During Rootwake,
only the current chamber's landmarks and shrines remain visible on the map;
other chambers are masked until the roots recede.

The next Ordeal is announced at the start of the **24-second Calm**, with a
specific preparation prompt and a nearby shrine recommendation. Recommendations
exclude only rituals you personally claimed, not wards already restored by a
teammate. Countdown supplies a final three-second warning and Rootwake boundary
guides. The next hazard does not repeat the previous one.

Each player can complete one personal ritual at each shrine per round. The
first real Warden completion at that shrine adds **8% team ward progress during
Calm/Countdown**, or **12% during an Ordeal**. Later completions there still earn
that player's gear, but never duplicate the shared progress. Impostors can
perform convincing fake rituals and earn gear without restoring the wards.
Rituals remain available during Ordeals if players take the risk; meetings pause
them. Round changes reopen personal rituals and shared seals while preserving
earned gear and accumulated team progress. Charges are capped at three per item.

The preparation card and restoration milestones point toward the Warden goal:
restore **100%** of the wards to win. The 25%, 50%, and 75% milestones derive
from persistent team progress, rather than resetting with the shrine seals each
round. Bots must travel along navigable routes, reach a real shrine, and remain
there to complete a ritual; they no longer add passive progress from afar.

Gear keeps the same wire identifiers for compatibility, but is presented as
Glowing Mushroom (`FLASHLIGHT`), Moonblossom (`FLARE`), and Echo Bell (`SONAR`).
Phantom paths use a per-Ordeal seed shared by the server.
Soft Glare reduces brightness without exposing colors/accessories. SFX can be
enabled independently of music; directional rustle captions work with sound off.

The impostor has one **shared special-action charge** each Ordeal: `V` Moon Sight
(up to 3.2 seconds) **or** `C` Echo Lure (aim first; 2 seconds; 220-unit range).
The kill remains a separate one-per-Ordeal action. The room server validates role,
life, phase, round, range and charge; only the caster receives private ability state.
Real footsteps and lures share the same anonymous sound-cue format and hearing range.
Rootwake confines Wardens and lures/sounds to their current chamber. The existing
Impostor Rootwalk exception permits the Impostor to pass through roots; the
navigation map still masks other chambers and never becomes a player radar.

This expansion changes shared world coordinates and private ritual-state
synchronization: deploy the frontend and room server together when releasing
it. Do not mix an updated
client with an old room server. The live Render service tracks
`codex/persistent-room-server`, not `main`; a main-only push will not update it.

| Action | Control |
| --- | --- |
| Move | `WASD` or arrow keys |
| Aim | Mouse |
| Work a moon shrine | Press or hold `E` |
| Expand / close navigation map | `M` or on-screen map button |
| Select gear | `1`, `2`, `3` |
| Use gear | `F` or right-click |
| Report / emergency | `R` |
| Impostor kill | `Q` or `Space` |
| Impostor Moon Sight | `V` |
| Impostor Echo Lure (aim first; shares charge with Sight) | `C` |
| Environmental sound / reduced glare | `ENABLE SFX` / `SOFT GLARE` |

## Eye customization

The wardrobe offers five cosmetic eye shapes: Fierce, Round, Dreamy, Joyful, and
Starry. Selections sync through room creation/joining, lobby profile updates,
gameplay and voting. Eye shapes cannot change during a match and are hidden in
anonymous Ordeal silhouettes. Older clients default to Fierce; missing profile
fields preserve existing selections. Practice also uses the selected appearance.
Release both the frontend and room server for multiplayer eye customization.

Slimes have a soft idle bounce and movement-driven squash/stretch, directional
lean, eye tracking, attached hats and height-reactive shadows. Animation follows
actual rendered travel (including AI and remote players), settles when blocked,
and does not change collision or send extra network traffic. Reduced-motion
preferences disable the decorative bounce in both the menu and arena.

## Optional Google Analytics 4

The GA4 integration is **inactive until a valid Measurement ID is configured**.
Nothing needs to change on the room server, and no API secret is needed. The
Measurement ID is public browser configuration, not an account credential.

### Activate after creating your property

1. Open [Google Analytics](https://analytics.google.com/) and create an Analytics
   account/property for Moonwarden, or select your existing property.
2. In **Admin → Data collection and modification → Data streams**, add a **Web**
   stream for `https://moonwarden-two.vercel.app` and name it Moonwarden.
3. **Turn Enhanced measurement off** for this stream. The app sends its own
   allowlisted page/game events. Automatic form/search/link/history measurement
   could bypass the app's field filtering or duplicate page views.
4. Copy the stream's **Measurement ID** (`G-…`). Add
   `NEXT_PUBLIC_GA_MEASUREMENT_ID` to this project's **Production** environment
   variables in Vercel. Leave Preview/Development unset to avoid mixing tests
   into real-player statistics. A rebuild/redeploy is needed after changing a
   public environment variable; adding a variable alone does not update a site.
5. Review the property's data-sharing and retention settings. Keep Google
   Signals, User-ID/user-provided-data collection, Ads links, advertising features
   and unnecessary sharing disabled. The included
   `/privacy` disclosure describes this limited analytics setup, not every future
   third-party integration or a blanket guarantee of legal compliance.
6. After the separately authorized release, open the site in a fresh browser,
   choose **Allow analytics**, then check **Realtime**. Test rejecting and
   withdrawing through **Privacy settings** as well. Google ingestion/DebugView
   cannot be verified before a real property is connected.

Official setup instructions:
[Create a GA4 property and web stream](https://support.google.com/analytics/answer/9304153).
No Google account/property or deployed environment is created or changed by the
local implementation or tests.

### Consent and privacy safeguards

- Basic opt-in: no Google tag request or analytics events before consent.
  Declining is equally accessible and does not affect gameplay.
- Consent expires after 180 days. Settings can be reopened; withdrawal disables
  collection and clears this integration's host-only `_ga` cookies. Cross-tab
  preference changes are respected. DNT/GPC requests keep analytics disabled.
- Only fixed event names, fixed enum values and bounded numeric fields pass.
  No names, chat, room codes, IDs, raw errors, roles, player movement, arbitrary
  paths, URL queries/fragments or full referrer URLs are sent by app events.
- GA4's own cookies distinguish browsers/sessions after opt-in; this is **not**
  an anonymous-user promise. Advertising consent always stays denied.
- Analytics is nonblocking, optional and outside movement/render loops. A
  missing ID, blocked script/storage or denied consent must not prevent play.

Events: `room_create_attempt`, `room_join_attempt`, `room_entered`,
`room_join_failed`, `match_started`, `match_completed`, `match_left`.
Register event-scoped custom dimensions for `mode`, `method`, `entry`, `reason`
and `outcome`, and custom metrics for `player_count` and `duration_seconds`, if
you want to explore those parameters in GA4 reports.

These are **per-player participation** events, not counts of unique matches:
six connected consenting players can produce six match starts. Match callbacks
are deduplicated within each participation. Explicit early exits are measured;
closing a tab, crashes and network failures are not guaranteed `match_left`
events. No pre-consent gameplay is replayed after opt-in. Consenting only after
a match begins may yield an incomplete funnel, so use these as directional
product metrics rather than authoritative server totals or a latency monitor.

Local tests do not contact Google:

```bash
npm run test:analytics
```

For an intentional manual GA4 DebugView test, use a **separate test property** in
`.env.development.local` with `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-…` and
`NEXT_PUBLIC_GA_DEBUG=true`, restart the dev server and explicitly allow analytics.
Do not enable this on the production property. Normal localhost/development
traffic is blocked even if a production ID was accidentally copied locally.

## Verify

```bash
npm run build
npm test
node --import tsx --test tests/multiplayer.test.mjs tests/movement.test.mjs tests/network.test.mjs
```

The app uses the bundled vinext/Vite runtime and is compatible with the Sites
hosting target declared in `.openai/hosting.json`.
