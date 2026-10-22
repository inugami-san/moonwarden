# Moonwarden

Moonwarden is a social deduction playtest set in an ancient mountain sanctuary
within the Silverpine forest. It runs in the browser with a procedurally rendered
2D Canvas world, multiplayer rooms, and autonomous AI wardens.

## Versions and releases

`package.json` is the single source of truth for the player-facing version.
The home, lobby, and gameplay logo display it as **v<version> · BETA**. The site
exposes its build at `/api/version`; the room server exposes its own release
at `/health` and in the `SERVER_INFO` handshake. These are public identifiers,
not credentials. Compare the site and server metadata when diagnosing a stale
deployment. The release channel remains beta until explicitly changed.

Use `MAJOR.MINOR.PATCH`: patch for fixes, minor for new gameplay/features, and
major for a deliberately breaking public release. While the game is `0.x`,
record breaking gameplay changes in a new minor release. Git already preserves
the code history; release tags identify the exact commits actually published.

For every future release:

1. Bump the package and lockfile together, for example
   `npm version patch --no-git-tag-version` (or `minor` for a feature release).
2. Move the relevant `[Unreleased]` notes into a dated version entry in
   [CHANGELOG.md](CHANGELOG.md). Do not invent historical release tags.
3. Change `GAME_WORLD_VERSION` in `server/game-version.ts` **only** when clients
   and room servers would otherwise disagree about geometry, simulation, or
   required protocol data. Release numbers alone never decide compatibility.
4. Run `npm run release:check` and the checks appropriate to the changes.
   `npm test` also runs the release check before building. It catches package/
   lockfile drift and missing release notes.
5. Commit the tested source and deploy the intended revision. For protocol
   changes, release the matching persistent room server before switching the
   site. Confirm the deployed metadata and multiplayer connection.
6. Tag that verified commit as `v<version>` (for example `v0.2.0`) and push the
   tag when the release is authorized. Never move an existing release tag.

Use the previous verified deployment for a rollback; do not rewrite Git history
or reuse a released version number for different code. An incompatible rollback
must restore matching frontend and room-server protocols together. Release
checks, package bumps, and Git tags do not deploy anything by themselves.

## Included gameplay

- Four to eight players; hosts choose 1 to half the circle as Hollows (default 1). Hollow teammates are revealed only to their own side. A 50/50 opening does not immediately end the match; expose every Hollow for a Warden role victory
- Test modes with forced roles (Warden or The Hollow) or random assignment
- Cinematic private role reveals for both Wardens and The Hollow
- Twenty-four-second Calm, three-second warning, and ten-second Ordeal phases; Mirror Pool lasts twenty-five seconds
- Six rotating Ordeals: Total Blackout, Thick Sea Fog, Moon Glare, Rootwake's six-cell grid, Phantom Procession decoys that Sonar can expose, and Mirror Pool's reversed controls and contact-triggered color swaps
- A shared 1920×1140 forest with connected clearings and a responsive following camera; each match randomizes shrine positions and surrounding trees/ward stones from one server-issued seed. Clients, bots, collision and the navigation map use the same layout, fixed for the match
- A collapsible minimap and expanded map (`M` or the map button) showing only your position, static landmarks, and shrine rewards—not players, bodies, roles, or sound cues
- Task-earned Glowing Mushrooms, five-second Moonblossoms, and Echo Bells, with clear reward notices
- Forest sanctums with mossy stone, living roots, fireflies, and flowers; personal reward availability and shared restoration have separate visual states
- Sanctums reopen each round (the next Calm, including after meetings), preserving earned gear and shared task progress; successful tasks emit a small 0.5-second completion pulse in solo and multiplayer
- One personal ritual per player, sanctum, and round; a teammate's shared seal never removes your gear reward. The first Warden completion restores wards; each Hollow completion siphons wards without consuming the Warden claim. Both leave the same public shrine visuals. All gauge changes settle together every four seconds, with gains scaled to living Wardens
- Quick arithmetic and constellation-link shrine puzzles. One wrong answer ends the attempt, awards no item, and shows a failure popup; reopening gives a different question, with a short retry delay
- One strike per Hollow per Ordeal, shared between a normal strike and Veiled Bite. Veiled Bite delays its puddle by eight seconds and recovers only after 45 seconds and two further Ordeal starts. Normal strikes retain a compact, non-blocking top kill notice (no public identity reveal), private Moon Sight, jelly puddles, reporting, emergency meetings, voting,
  ejection, task victory, and parity victory
- Phase-aware background music that crossfades between the gentle normal-flow theme and hostile Ordeal theme, preserving each track's position with an in-game BGM toggle
- Living-player meeting chat with contextual AI discussion for the local playtest
- Private death reveal identifying the killer before the eliminated player spectates
- AI navigation to actual shrines, on-site ritual dwell, hunting, earned item use, body discovery, self-reporting,
  and weighted voting
- Responsive keyboard, mouse, and touch controls
- **Multiplayer**: WebSocket transport with an HTTP relay fallback, 4-letter room codes, unique room-wide slime colors (including bots), waiting room chat and roster, host controls, a 20Hz room tick, buffered movement interpolation, and synchronized voting
- Cached translucent slime materials and shared, cached gameplay accessories in both customization and the arena; offscreen actor/prop drawing is culled without disabling simulation. Identity-concealing Ordeals retain anonymous silhouettes

### Painterly forest art

The local v0.3.0 visual pass uses lavender moonlight, amber shrine reflections,
translucent gel shading, smaller expressions, restrained squash/stretch, and
textured woodland materials. Gameplay and wardrobe use the same accessory
artwork and eye scale. Trees and stone props bake two layers per shape variant
into a bounded cache rather than repainting their texture every frame. The
floor is baked once per layout. Subtle grass and water reactions only run for
visible actors during Calm, and are disabled with reduced motion. They leave
no persistent trails. The art does not add colliders, reveal hidden identities,
or change the existing completed/personal/shared shrine rules.

Run `npm run test:art` for material, animation, caching, shrine state, and map
rendering checks. This is a 2D rendering update, not a 3D engine migration.

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

### Moonsway voting

Standard matches keep every vote on the selected destination. Moonsway is **off
by default**. A host may enable **Chaos · Moonsway** in the lobby before starting;
all guests see the setting, and it cannot change mid-match. Solo practice has
the same optional switch. The following rules apply only when Chaos is enabled.

Only the player who reports a slime puddle is affected: when they cast a player
vote, it has a **25% chance** to drift to another living player, excluding the
reporter and their original choice. This happens regardless of either player's
role; it cannot confirm whether someone is a Hollow, and it does not claim to
detect whether the reporter actually witnessed the kill. Emergency meetings,
skip votes, and every other voter's ballot are unchanged. If no alternative
exists, the vote stays on its original target.

The server rolls exactly once per accepted ballot, locks the result, and sends
its destination privately to that voter. Repeated clicks/packets cannot reroll
it. The same role-blind rule applies in solo play and to AI body reporters. The
meeting explains the risk before voting; a small Moonsway confirmation names
the actual destination, and the public tally counts that vote only once. Chat
is preserved when a vote receipt arrives. Protocol `silverpine-harmony-v5`
requires matching frontend and room-server deployments.

### Paired rites, field notes, and mobile movement (v0.3.0)

- At an available shrine, hold **H** or **HOLD TO HARMONIZE**. Two living slimes
  must deliberately hold the action, stand still within the shrine's radius,
  and remain together for 1.25 seconds. This is optional; ordinary puzzles still
  work alone. Both roles may participate. Each earns their own normal gear claim,
  with no doubled team restoration or extra immediate gauge signal.
- The rite makes a soft, range-limited hum. Nearby players can investigate;
  the sound and progress never name a participant or disclose their role. Moving,
  releasing, opening a dialog, disconnecting, dying, or a new round cancels a hold.
  Nearby AI performing the same shrine can cooperate in solo and multiplayer.
- **Field notes / N** opens a private, match-only notebook. Select a name,
  landmark, and time from memory. These are unverified player claims, not tracking.
  During meetings, **Draft message** copies a claim to the composer; only **SEND**
  shares it. Notes are not persisted or sent to analytics. Dead players cannot share.
- On mobile, touch any unobstructed part of the **left half of the gameplay area**
  and drag to spawn a floating joystick. A small drag walks slowly, a full drag
  reaches normal speed, and circular clamping prevents faster diagonals. Your
  movement also aims your light. A second finger may use the right-hand actions.
  Release/cancel, focus loss, rotation/resize, dialogs, or disconnection reset it.
  Desktop WASD/arrows remain available; Mirror Pool reverses both input types.
- Landmarks include Fallen Shrine, Willow Grove, and Moonwell, with shared map
  symbols, floor motifs, location callouts, and two checked approaches per shrine.
  Generated trees/stones never become invisible collision on the navigation routes.

The v0.3.0 source is prepared locally. Deployment still requires an explicit
release of **both** the site and persistent room server; pushing Git alone does
not promote production. No beginner preset or expanded analytics is included.

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
first real Warden completion at that shrine queues team ward progress:
`clamp(14 / livingWardens, 1.5, 5)%`, multiplied by 1.25 during an Ordeal,
rounded to one decimal. Later Warden completions still earn personal gear but
never duplicate shared progress. Hollow rituals instead queue a reduction at
65% of the corresponding gain divided by the configured Hollow count, without
consuming the first Warden claim or allowing several Hollows to stack an
overwhelming drain on the same shrine.
The real gauge settles every four seconds; it never displays invented progress.
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

The Hollow has one **shared special-action charge** each Ordeal: `V` Moon Sight
(up to 3.2 seconds) **or** `C` Echo Lure (aim first; 2 seconds; 220-unit range).
The kill remains a separate one-per-Hollow, per-Ordeal action (normal OR stealth).
`X` Veiled Bite shares that strike and delays its puddle eight seconds, with a
45-second cooldown plus a two-Ordeal lockout. The room server validates role,
life, phase, round, range and charge; only the caster receives private ability state.
Real footsteps and lures share the same anonymous sound-cue format and hearing range.
Rootwake confines Wardens and lures/sounds to their current chamber. The existing
Rootwalk exception for The Hollow permits it to pass through roots; the
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
| The Hollow — strike | `Q` or `Space` |
| The Hollow — Veiled Bite (delayed puddle) | `X` |
| The Hollow — Moon Sight | `V` |
| The Hollow — Echo Lure (aim first; shares charge with Sight) | `C` |
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
