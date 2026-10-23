# Moonwarden — agent handoff and pending work

Updated: 2026-10-23 (Asia/Manila).

## Current production release: v0.4.0

- Live: <https://moonwarden-two.vercel.app/>. Its public `/api/version` now reports
  **0.4.0 / silverpine-bell-v6** after production promotion.
- Release commit: `6bcda6282c93a65374b03c2c24531cf47d299d91`.
- Vercel deployment: `dpl_59gmjywgPxSk6Vy3TEAQbve8ghje`, **READY**, Next.js 16.2.6,
  build 18 seconds. Unique URL: <https://moonwarden-d0gy3prk2-christainj.vercel.app>.
- Render `moonwarden-rooms`: `srv-db8u6cs9v7es73dt2dt0`, deploy
  `dep-dbdcjsl9fdbs73alg8vg` **live**, exact same release commit. `/health` reports
  0.4.0/v6 and a public WebSocket handshake from the production origin succeeded.
- Both existing release/backend branches were fast-forwarded; `main` was untouched.
  The separate untracked `prototypes/` directory was excluded. GitHub authentication
  used the existing gh login through a per-command helper, not global Git changes.
- 72 focused checks passed including real WebSocket co-op; release/hold checks,
  TypeScript and scoped ESLint passed. The development victory preview returns
  HTTP 404 in production. The Vercel runtime error query returned no logs; drains
  and broader monitoring were not audited. This is not a full human playtest.
- Existing cached clients must refresh and reconnect/recreate rooms after this
  coordinated v5-to-v6 release. Backend auto-deploy remains off.

## v0.4.0 implementation notes (latest request)

The user now explicitly authorized implementation of forest restoration rewards
and clearer Harmonize guidance, followed by production deployment. This supersedes
the earlier local-only restriction for this release. The coordinated target is
the existing Vercel Moonwarden project (`moonwarden-two.vercel.app`) plus the
existing Render room service in Christian's workspace, not new infrastructure.

`app/restoration-art.ts` paints three bounded, cached tiers from the shared public
gauge: flowers at 25%, shrine lanterns at 50%, denser flowers/fireflies at 75%.
It changes no light-item visibility or collisions. `updateRestorationSound` adds
Calm-only birdsong and one-time high-water milestone chimes; re-crossing a siphoned
threshold cannot spam celebrations. All normal audio preferences still apply.
Harmonize shows 2 players / 1.25 seconds / audible nearby, and explains its faster
channel, gear rewards and the fact that a Hollow can participate. Ritual mechanics
are unchanged. Package/lockfile are now 0.4.0; compatibility remains local v6.
The coordinated deployment is confirmed above. Older local-only statements below
are retained as development history, not the current deployment status.

## Read this first

This file preserves the recent conversation for a new agent. Read it alongside
`README.md`, `CHANGELOG.md`, the actual source, and the current user request.
A new agent does not automatically inherit the previous chat's memory.

This began as a documentation-only handoff. The user subsequently asked another
model to continue locally, then asked this agent to continue the slime-art work.
Do not interpret this file alone as authorization to push or deploy anything.

## Development history preceding v0.4.0

- New user request: distinct match-win animations. `app/match-victory.ts` selects
  Warden/Hollow endings only from exact official solo/server result strings.
  `app/victory-art.ts` paints a deterministic, bounded Canvas scene with shared
  slime/eye/accessory art: flowers + hopping circle for Wardens; eclipse + roots
  for The Hollow. Companions are illustrative, never inferred hidden-role rosters.
  A local winner (even if eliminated) keeps their own cosmetics; opponents see a
  generic winning-team avatar. Unknown result codes get neutral completion copy.
- `app/victory-overlay.tsx` / `app/victory.css`: 5.4s / 5.8s presentation, skip or
  Escape settles immediately, native modal focus, static reduced-motion result,
  clear Return to lobby. RAF and timers stop/clean up; no per-frame React updates.
  `ForestAudio.celebration` adds gentle synthesized team-specific flourishes under
  existing mute/unlock/polyphony limits. Gameplay music now fades at match end.
- The Game onEnd callback clears meetings, banishment, puzzles, role/death notices,
  settings and navigation before showing the final result. Repeated MATCH_RESULT
  packets are ignored after gameOver; input/puzzle state is cancelled there too.
  Server win logic, network schema and compatibility version are unchanged by
  this presentation work. Local v6 still needs a coordinated eventual release.
- Preview at <http://localhost:3100/dev/victory>. This server-guarded route exists
  only in development (`notFound()` otherwise), with Warden/Hollow, sound and
  reduced-motion controls. It starts no match and never mutates room state.
  Focused suite: `npm run test:victory`; included in the normal test command.
- Victory verification: **115 focused regression tests passed** (victory model/
  rendering, audio, real-client final-result handling, banishment, exploration,
  HUD, slimes, hold gauge, camera and sight). TypeScript, scoped ESLint and
  whitespace checks passed. Browser review confirmed both final scenes, skip,
  automatic completion, return controls, native modal focus, and an immediate
  static reduced-motion result with no CSS animation; no console errors were
  reported. Sound graphs/mute were tested with fake WebAudio, not a subjective
  listening test. This is not a full human multiplayer match playtest. No deploy.
- Latest requested visual/input update: `app/world-camera.ts` now uses **1.22×**
  zoom, about 15% more world space per dimension than 1.4×. Sight radii, cover,
  hidden-kill rules and world/collision geometry are unchanged.
- Slimes now use a **woodland-wisp outline**, not the earlier mochi dome: an
  off-centre crest, rippled gel base and suspended seed core. The same outline
  is used in portraits, silhouettes, kills and banishment. Larger (~8–9 unit)
  movement hops, stronger volume-preserving compression and a separately cached
  spring-following sprout make motion more visible. Reduced motion remains still;
  subdued/concealed materials do not gain the seed or sprout.
- Hold-E tasks now expose a **1.8-second progress gauge** with percentage and
  remaining time: `app/task-hold.ts`, `app/task-hold-gauge.tsx`, and engine/HUD
  integration in `app/page.tsx` / `app/gameplay-hud.css`. Touch holds capture the
  pointer, handle cancellation/blur, and support holding Space/Enter on the
  focused task button. Releasing E, leaving/switching shrine, navigation, death
  or disconnect clears progress; a pending reward cannot start another channel.
  Puzzles still use their existing question UI instead of the hold gauge.
- `snapshotsEqual` comparisons now include hold progress/holding and report
  label/hint, fixing otherwise-stale gauge/countdown text. Animation stays in
  the Canvas engine/cached layers; HUD updates use quantized snapshots.
- Latest camera/wisp/gauge verification: **114 focused tests passed** across
  slime art/motion, task holds, camera, sight, real-client exploration, feedback,
  forest art, banishment, report rules and gameplay UI. TypeScript, scoped ESLint
  and `git diff --check` passed. The browser rendered the new portrait/gameplay
  outline and reported no console errors. Hold completion/release, station
  switching, touch cancellation and pending multiplayer reward behavior were
  checked against the real client engine in tests; this was not a complete
  manual multiplayer playtest. `npm run test:task-hold` runs the narrow hold suite.
- New report mechanic: the emergency bell is locked until Ordeal one ends,
  including an Ordeal ended early by a body report. The first emergency is then
  immediately available in Calm near the central bell. Every meeting's end
  starts a **shared 60-second cooldown**, ticking only during active gameplay.
  Nearby visible body reports bypass the lock and cooldown. The button is truly
  disabled when unavailable, with a lock/countdown label and explanatory title.
- Shared rules: `server/report-rules.ts`; authoritative enforcement and sync:
  `server/game-room.ts` / `server/game-types.ts`; solo/input/HUD:
  `app/page.tsx`. New checks: `tests/report-rules.test.mjs` and a real-client
  handler/snapshot test. Run `npm run test:report` for the narrow server/rule suite.
- **Current local compatibility is `silverpine-bell-v6`**, not v5. The next
  release must update both the persistent room server and frontend together.
  The previous published baseline below remains v0.3.2/v5. No remote rollout is
  authorized by this local implementation request.
- Bell verification: the 103-test gameplay/report regression run passed, followed
  by a 33-test run including the new real-client handler/snapshot check and
  compatibility/release checks (these runs overlap). TypeScript and whitespace
  checks passed; scoped ESLint had no errors and one existing unused-import
  warning in `tests/sanctum.test.mjs`. The restarted local frontend and room-server
  endpoints both report v0.3.3 / `silverpine-bell-v6`. Browser multiplayer showed
  the report button disabled as “Locked” during Ordeal one. No remote deployment.
- The working tree contains another model's v0.3.3 vote-out presentation work:
  `app/banishment.ts`, `app/banishment-art.ts`, `app/banishment-overlay.tsx`,
  `app/banishment.css`, and integrations/tests. The old pending design below is
  retained for context, but it is no longer accurate to assume no code exists.
  Preserve those changes; this slime-art continuation is not a banishment rewrite.
- The other model also started a rounder mochi dome, translucent material depth,
  smaller eye shadows, and a two-leaf sprout in `app/slime-art.ts` and
  `app/slime-portrait.tsx`. Continue that direction rather than restoring old art.
- This continuation shares body-space lighting coordinates between Canvas and
  SVG, aligns the gel/floor/leaf detail, and adds lightweight SVG surface grain.
  Sprout paths replay the same command geometry in both renderers; they no longer
  require `Path2D`. Colors normalize before caching; the cache has a 48-skin LRU
  limit. Silhouettes and subdued Ordeal skins do not acquire sprout decorations.
- Physics, collisions, network messages and hidden-role behavior are unchanged.
- The user requested local preview earlier. Ports 3000/3001 belong to unrelated
  OrbStack listeners; leave them alone. Use frontend 3100 and local room server
  3101, with process-only local socket/origin configuration, not production env
  changes. Check running processes before starting duplicates.
- Latest published baseline below is still v0.3.2; local package v0.3.3 and
  changelog entries are not proof of a new deployment.
- Local verification for this art continuation: 53 focused tests passed across
  slime art/motion, forest art, sight/privacy and banishment helpers; TypeScript,
  scoped ESLint and `git diff --check` passed. Browser inspection confirmed the
  home portrait and solo gameplay sprite render, with no reported browser errors.
  The browser also created and left a local multiplayer room successfully.
  This is not a full multiplayer match or complete banishment playtest.
- Preview left running at <http://localhost:3100/> (the dev server currently binds
  IPv6 localhost, so do not substitute `127.0.0.1` for its frontend URL).
  Room server: `ws://127.0.0.1:3101/ws`. The earlier art check used v5; the local
  room process has now been restarted for the bell rules and both endpoints
  report v0.3.3 / `silverpine-bell-v6`. No push or deployment was performed.

## Previous published baseline (v0.3.2)

- Game: **Moonwarden**, a browser-based multiplayer social deduction beta in a
  magical mountain forest. Public role names are **Warden** and **The Hollow**.
- Live site: <https://moonwarden-two.vercel.app/>.
- Latest published frontend: **v0.3.2**, commit `a83d9f1`, tag `v0.3.2`.
- Release branch: `codex/moonwarden-release-2026-10-19`.
- Repository: <https://github.com/inugami-san/moonwarden>.
- Vercel reported the production deployment **READY** and assigned the site alias.
  Deployment ID: `dpl_5zcxkHwqTYCd2KHJW9Z1m6fCYabA`.
  Unique URL: <https://moonwarden-fp2ye2u74-christainj.vercel.app>.
- Vercel's required Next.js build and TypeScript step succeeded (build: 22 seconds).
  **Local tests and playtesting were explicitly skipped at the user's request.**
  Runtime logs, monitoring and drains were not audited. Do not describe this
  release as fully tested or claim every gameplay flow was confirmed.
- The release commit and tag were pushed to GitHub. `main` was not changed.
- Multiplayer compatibility remains `silverpine-harmony-v5`.

These are recorded release facts, not a promise that remote state can never change.

## Pending feature: role-specific vote-out animation

**Original status: design agreed, pending. Local implementation was subsequently
added by another model; inspect it before deciding what remains (see above).**

The user first liked the proposed “The Moon's Judgment” banishment cinematic,
then specifically requested **distinct animations for a Warden and a Hollow**.
The two endings below were proposed in response. The next request was to save
the work as pending in this handoff, not to implement it yet.

### Shared direction

- A magical banishment, visually distinct from the Hollow's existing swallowing
  kill animation. Do not reuse the kill cinematic as an ejection effect.
- Roughly **3 seconds total**; keep it brief and readable.
- Same suspenseful opening for both roles: the voted slime stands in a moonlit
  clearing, their name appears, fireflies become still, and a rune forms below.
- Keep the opening neutral. Branch only when the official concluded-vote result
  permits the role reveal; do not reveal a living player's hidden role early.
- Use the actual voted player's appearance where available, consistent with the
  shared gameplay slime/accessory rendering.
- No gore, rapid flashing or large camera shake. Provide a reduced-motion
  alternative, readable verdict text, and respect existing audio preferences.

### Warden ending — “An Innocent Light”

1. Gentle silver moonlight lifts the slime while they look back at the circle.
2. The jelly body softly stretches and dissolves into silver fireflies.
3. One small white flower remains where they stood.
4. A delicate, slightly sad bell accompanies **“[Name] was a Warden.”**

Emotional goal: **“We made a mistake.”** Gentle, beautiful and a little sad.

### Hollow ending — “The Forest Rejects You”

1. The moonlit rune fractures, exposing dark violet energy.
2. The slime's friendly expression twists; shadow tendrils appear as it struggles.
3. Luminous roots bind it and pull it into a swirling shadow below the clearing.
4. The rune seals with a deep thump: **“[Name] was The Hollow.”**

Emotional goal: **“We caught you.”** Suspenseful and unsettling, not graphic.
Do not imply the match is won if other Hollows remain.

### No-ejection outcomes

- Ties/skips should have a short fading rune and **“No one was banished.”**
- No player disappearance, role reveal or Warden/Hollow-specific sound on a tie
  or skipped vote.
- Keep the existing tally accessible: player names, slime colors and vote counts.

## Integration map for the next agent

The game is a **2D Canvas** renderer with a React UI, not a 3D engine. Prefer
code-native Canvas/CSS animation and existing shared art over new raster assets
or a rendering-engine migration.

Relevant code:

- `app/page.tsx`: `OrdealEngine`, solo vote resolution (`vote`), network
  `MEETING_CONCLUDED` handling, `resolveMeeting`, meeting/tally React markup,
  `MATCH_RESULT` handling and existing role/death presentation. Search symbols
  rather than relying on line numbers, which will change.
- `server/game-room.ts`: authoritative multiplayer voting, `MEETING_CONCLUDED`
  broadcast, and the **7-second scheduled meeting resolution** after the tally.
- `server/game-types.ts`: wire message types. Currently `MEETING_CONCLUDED`
  contains `tally`, `ejectedId`, `verdict`, and `tied`; it does **not** contain a
  separate structured `ejectedRole` field.
- `server/role-presentation.ts`: public role labels, `ejectionVerdict`, legacy
  verdict normalization (`meetingVerdictLabel`), and match result labels.
- `app/slime-art.ts`, `app/slime-motion.ts`, `app/accessory-art.ts`,
  `app/slime-eyes.ts`: reuse the same slime geometry, expressions, animation and
  cosmetics as gameplay.
- `app/forest-audio.ts`: existing procedural audio and user preference lifecycle.
- `app/slime-devour.ts`: existing kill effect; preserve it as a separate concept.
- `app/gameplay-hud.css`: scoped current gameplay palette and UI behavior.

Important implementation decisions/constraints:

- Stable internal role IDs are still `CREWMATE` and `IMPOSTOR`. Present them as
  Warden and The Hollow. Do not rename wire IDs just to change presentation.
- Multiplayer clients do not necessarily know another player's role before the
  verdict. Do not use a locally defaulted role as the animation's truth source.
  Choose a reliable post-verdict role source and centralize its normalization.
  If structured protocol data is needed, account for the current room server's
  compatibility and coordinate its release; never broadcast hidden roles early.
- Trigger once per concluded meeting, not on every render or network snapshot.
  Cancel/clean up on leave, disconnect, unmount or a superseding match state.
- Keep solo and multiplayer presentation consistent. All clients must see the
  same officially ejected player/outcome, with no extra local random decision.
- Do not pause the authoritative multiplayer server for a client animation or
  let a replay delay server state. Fit the existing result window. Handle a
  `MATCH_RESULT` arriving during the cinematic without losing or duplicating it.
- Coordinate the existing Continue Match action and tally visibility so they do
  not unexpectedly cut off or repeatedly trigger the cinematic. Clear movement
  inputs and prevent gameplay controls from firing beneath the presentation.
- Preserve multiple-Hollow victory rules, Moonsway/ballot behavior, reporting,
  chat, tally accuracy, and spectator state. This is presentation, not new rules.

## What we just completed — do not redo

### v0.3.2: atmosphere and visibility

- `app/forest-atmosphere.ts`: cached moon-cast canopy shadows, low-resolution
  night/mist mask, warm shrine light pools, observer-relative cover shadows,
  and slow world-anchored ground mist. Extra mist during Thick Sea Fog;
  reduced motion holds wisps still. Moon Glare keeps its bright exposure.
- `app/page.tsx`: atmosphere integration below the HUD and beneath Rootwake
  occlusion; slime colors/accessories/labels recede before the final neutral
  outline disappears at the distance boundary. Buffers are released on exit.
- `server/visibility.ts`: wider smoothstep distance fade. Cover rejection stays
  immediate, with no lingering ghost/trail behind an obstacle.
- Atmosphere does not consume remote player/body positions. Preserve the shared
  sight checks for players, puddles, particles, witnesses and kill effects.
- No collision, map geometry, network or gameplay protocol changes in this patch;
  no Render backend deployment was necessary.

### v0.3.1: camera, HUD and landscape play

- Closer 1.4× following camera, preserving the 1920×1140 world and input mapping.
- Midnight-indigo panels, mist-blue information, antique-gold actions and crimson
  danger cues. Compact inventory, opt-in map and collapsible guidance/settings.
- Tactile button interaction, existing UI sound cues and reduced-motion support.
- Landscape-first mobile gameplay, floating joystick, portrait rotation guidance.
  Rotation clears held input; solo pauses but live multiplayer stays server-driven.
- Local sight/privacy: cover blocks players and kills; hidden attacks do not
  create visible shake/particles or replay for someone arriving afterward.
  Moon Sight and anonymous Echo Bell contacts retain explicit exceptions.
- Client sight is rendering concealment, **not server-side anti-cheat**. Do not
  claim hidden actor positions are absent from network packets.

See `README.md` and `CHANGELOG.md` for earlier systems: task-earned forest items,
shrines/round resets, paired rituals, field notes, six Ordeals, multiple Hollows,
one strike per Hollow per Ordeal, and Veiled Bite.

## Deployment and workspace context

- Checkout: `/Users/fdc.christianj-nc-web/Documents/Among Us`.
- At handoff, tracked source was clean at `a83d9f1` before this documentation.
  `prototypes/` was already untracked and user-owned: preserve it; do not stage
  or deploy it accidentally.
- Node, when not on PATH:
  `/Users/fdc.christianj-nc-web/.nvm/versions/node/v24.15.0/bin`.
- Vercel: project `moonwarden`, scope `christainj`, project ID
  `prj_fnsKcfgCYjBI3vzBDBB5O6r4Njb9`. Existing `.vercel/project.json` is linked.
  The public alias is **moonwarden-two.vercel.app**; do not create a new project
  or switch to the older moonwarden-pi site.
- Persistent multiplayer: `wss://moonwarden-rooms.onrender.com/ws` on Render;
  service `srv-db8u6cs9v7es73dt2dt0`, Christian's workspace, free Singapore.
  Last recorded room-server source was v0.3.0 / `4b30153` on
  `codex/persistent-room-server`, compatible via `silverpine-harmony-v5`.
  Do not redeploy/change the backend for presentation-only work without need.
- Follow current repository release/version instructions. Bump package and lock
  together for a new release, add changelog notes, and never move/reuse a tag.
  Change `GAME_WORLD_VERSION` only for an actual incompatibility.
- The previous direct release skipped tests at the user's explicit request.
  Follow the next user's testing/deployment instructions; distinguish build
  success from gameplay verification. This documentation request does not
  authorize another release.
- Do not expose secrets, edit global Git settings, force-push, overwrite `main`,
  create paid resources, or disturb unrelated project work.

## Suggested continuation prompt

> Read AGENT_HANDOFF.md, README.md and CHANGELOG.md. Continue the pending
> role-specific vote-out cinematic for Moonwarden: the Warden becomes silver
> fireflies and leaves a white flower, while The Hollow is bound by luminous
> roots and pulled into a sealed violet shadow. Preserve the shared suspenseful
> opening, official role-reveal timing, multiplayer lifecycle and existing tally.
> First check the current worktree so you do not overwrite newer changes.
> Follow my current instructions about testing and deployment.
