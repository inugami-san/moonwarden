# Moonwarden changelog

The game is in public beta. Versions follow `MAJOR.MINOR.PATCH`; release numbers
are separate from the multiplayer compatibility identifier. This file describes
source releases, not proof that a particular server has been deployed.

## [Unreleased]

No further release changes recorded.

## [0.4.0] - 2026-10-23

### Changed

- Public ward restoration now returns wildflowers at 25%, awakens shrine
  lanterns at 50%, and fills the sanctuary with blooms/fireflies at 75%.
  Calm gains gentle, layered birdsong and one-time milestone chimes. Scenery
  respects existing Ordeal masks and adds no gameplay light or collision.
- Harmonize explicitly shows its two-player, 1.25-second, audible-nearby trade-off.
  Its tooltip explains both players earn gear and a Hollow can join the duet;
  the underlying role-blind ritual rules and timing are unchanged.
- Final match results now have two short, skippable celebrations: Warden moonlit
  blooms and joyful hops, or a Hollow eclipse with spreading shadow roots. Shared
  gameplay slime/costume art, gentle synthesized flourishes, native modal focus,
  a static reduced-motion ending and a clear return-to-lobby action replace the
  old simulation-complete card. Only official final result codes select a winner;
  hidden player roles and win conditions are not changed.
- Match completion clears transient overlays and input, fades gameplay music,
  and ignores duplicate multiplayer result packets. A development-only
  `/dev/victory` art review page offers both endings without running a match;
  it returns not-found outside development.
- Gameplay camera eased from 1.4× to 1.22×: about 15% more world space in each
  dimension without changing sight, cover, hidden-kill rules or collision.
- Slimes now have a woodland-wisp outline with an asymmetrical crest, rippled
  gel base and suspended seed core shared by portraits/gameplay. More visible
  volume-preserving hops, softer pacing, landing squash and separately cached
  sprout follow-through replace the subtle dome breathing. Reduced motion and
  anonymous/subdued materials retain their concealment behavior.
- Hold-E shrines display a progress bar, percentage and remaining seconds for
  their 1.8-second attunement, including touch/keyboard activation of the task
  button. Releasing, leaving, switching shrine or opening navigation clears the
  channel instead of carrying progress elsewhere. Puzzles remain separate.
- HUD snapshot comparisons now include task progress and report labels, so both
  the attunement gauge and emergency-bell countdown actually update on screen.
- Emergency meetings are locked until the first Ordeal ends (a body report can
  end that Ordeal early). After any meeting ends, the central bell has a shared
  60-second cooldown measured in active gameplay time. Nearby visible puddles
  always bypass the first-Ordeal lock and bell cooldown. The disabled report
  control explains its state and shows remaining cooldown seconds.
- Room authority enforces the same report rules and syncs the bell state to
  clients. Multiplayer compatibility is now `silverpine-bell-v6`: release the
  matching frontend and room server together.
- Continued the local rounded mochi-slime art pass with shared Canvas/SVG light
  positions, matching gel depth, floor bounce, leaf detail and subtle surface grain.
  The same body remains in silhouettes; subdued Ordeal skins add no sprout detail.
- Sprout artwork now replays shared geometry without a separate `Path2D`
  dependency. Texture colors normalize safely and a bounded, recently-used cache
  avoids retaining every past customization palette. No gameplay/protocol change.

## [0.3.3] - 2026-10-22

Local presentation work; not separately deployed. Included in v0.4.0.

### Added

- "The Moon's Judgment" role-specific vote-out animations:
  - Neutral suspenseful opening: the voted slime stands in a moonlit clearing, fireflies hush, and an ancient moonlit rune forms below.
  - Warden ending ("An Innocent Light"): gentle silver moonlight lifts the slime as they look back at the circle, softly dissolving into silver fireflies and leaving a single blooming white flower accompanied by a delicate, slightly sad bell.
  - The Hollow ending ("The Forest Rejects You"): the rune fractures with violet energy as the slime's expression twists; luminous roots bind it and pull it into a swirling shadow below the clearing, sealing with a deep resonant thump.
  - Ties and skips: gentle fading rune with "No one was banished", without role reveals or player disappearance.
  - Accessible announcement for assistive technology and a peaceful still crossfade for reduced motion.
  - View Tally action allowing players to skip directly to the final vote totals at any point.

### Changed

- Centralized post-verdict role normalization (`verdictRole`) in `server/role-presentation.ts`, ensuring client animations read only authoritative concluded-meeting verdicts without leaking living roles early.
- This local presentation work did not change `silverpine-harmony-v5`; v0.4.0
  includes the subsequent bell-rule protocol change described above.

## [0.3.2] - 2026-10-22

### Changed

- Moonlit night shading, cached long canopy shadows, warm shrine light pools,
  and softly feathered observer-relative shadows make cover visually apparent.
- Scenery now recedes into a blue-grey mist boundary alongside player visibility.
  Slime colors, accessories and labels fade before the remaining anonymous outline
  disappears; distance fades use a wider eased transition without ghost trails.
- Slow world-anchored ground mist gains density during Thick Sea Fog. Reduced
  motion holds wisps still; the HUD stays clear and Moon Glare stays bright.
- Existing cover, Rootwake, light-item, Moon Sight and hidden-kill rules remain
  in place. Atmosphere never consumes hidden player/body positions. Cached ground
  shadows and a reduced-resolution mask limit additional rendering work.
- Client-only update; multiplayer compatibility remains `silverpine-harmony-v5`.
  Tests and playtesting skipped at the user's request; deployment build only.

## [0.3.1] - 2026-10-22

Release prepared from the tested camera, visibility, and gameplay UI updates.
Deployment status is tracked separately by Vercel.

### Changed

- Gameplay UI refreshed with midnight-indigo, mist-blue and antique-gold controls, compact
  progress cards, opt-in minimap and collapsible Ordeal/role guidance. Shrine,
  meeting, map and reward screens share the new palette.
- Raised buttons respond with a press/spring effect and existing UI sound cues.
  Keyboard focus and reduced-motion alternatives remain available.
- Audio, glare and control tips live in a focus-trapped settings dialog. Opening
  it clears movement and disables the joystick; the match itself keeps running.
- Mobile gameplay is landscape-first, with a focused rotate prompt in portrait
  and a compact horizontal HUD. Rotation clears held inputs. Solo practice pauses
  while rotating; connected multiplayer continues on its room server.

### Fixed

- A 1.4× closer following camera replaces the broad desktop overview while
  preserving world geometry, joystick/mouse mapping, and native render resolution.
- Players, puddles, kill animations and particles share local distance, cover,
  light and Rootwake visibility rules. Terrain stays readable. Light no longer
  identifies actors through cover; fog/glare/phantom identities stay concealed.
- Hidden attacks no longer produce visible particles or camera shake, nor replay
  when a player approaches afterward. Nearby clear witnesses still see attacks.
- Solo AI testimony and local body-report prompts use the same sight rules.
  Moon Sight and anonymous Sonar contacts retain their explicit exceptions.
- Visibility is a client rendering rule, not a server-side anti-cheat boundary.
  Network packets and multiplayer compatibility remain `silverpine-harmony-v5`.

## [0.3.0] - 2026-10-22

Prepared locally for the next beta release; this entry is not a deployment claim.

### Added

- Floating, multitouch virtual joystick on the left side of the gameplay area.
  Radial dead zone, proportional walking speed, clamped diagonals, movement-based
  mobile aim, pointer capture, and cancellation on dialogs, blur, resize or disconnect.
- Optional paired shrine rituals: hold H (or the touch action) with another willing
  slime for a 1.25-second channel. Nearby humming attracts attention. Both roles can
  participate; personal gear and anonymous ward settlement keep their existing rules.
- Private, match-local field notes and meeting observation drafts. Notes are manual
  claims, never verified sightings or automatic tracking, and are never sent automatically.
- Fallen Shrine, Willow Grove and Moonwell landmark identities with map symbols,
  distinct floor motifs, a location label, and two validated approaches per seeded shrine.

### Changed

- Painterly forest rendering: translucent moonlit slimes, smaller expressions,
  restrained gait and costume follow-through, woven/wood-grain accessories,
  textured foliage and stone, distinct shrine crowns, and lavender/amber lighting.
  Forest prop layers are cached; calm-only grass/water reactions respect reduced
  motion. Existing collision geometry and Ordeal identity concealment are unchanged.
- Moonsway is disabled by default. Hosts may opt into a clearly disclosed Chaos
  setting before a match; standard ballots always retain the chosen destination.
- Multiplayer compatibility is `silverpine-harmony-v5`. The frontend and room server
  must be deployed together. No beginner preset or new analytics collection is added.

## [0.2.0] - 2026-10-21

### Added

- Moonsway: a body reporter's player vote has a 25% chance to move to another
  living player, excluding the reporter. One accepted ballot means one roll;
  skip votes, emergency meetings, and other voters are unaffected. The affected
  voter receives a private receipt; totals use the actual destination.
- Multiplayer compatibility changes to `silverpine-moonsway-v4`; release the
  matching site and room server together. No hidden roles decide this chance.

- Visible release version in the home, lobby, and gameplay branding.
- Public site version endpoint (`/api/version`), room-server version metadata,
  and release consistency checks.
- Configurable Hollow teams, defaulting to one and capped at half the players.
- Stealth strikes with delayed puddles and a long cooldown.
- Seeded station layouts with surrounding forest obstacles.

### Changed

- Redesigned all four headdresses with forest materials, stitching, moonstones,
  and layered wings. Picker previews are contained and use the same artwork,
  frame, and head anchor as gameplay; no per-frame accessory repainting.
- Ward gains scale with living Wardens; Hollow rituals siphon the gauge.
- Public gauge changes settle on a shared four-second clock.
- Wrong puzzle answers immediately fail; reopening provides a new question.
- Customization and gameplay share cached accessory artwork.

### Fixed

- Incorrect shrine answers show a small, auto-dismissing notification instead
  of a full-screen dialog. Movement and actions remain available after failure.
- A half-Hollow lobby no longer ends immediately at its opening tie.
- Public shrine completion visuals do not expose which role completed a task.

### Release notes

- This is the first explicitly numbered gameplay release; earlier development
  used the package placeholder `0.1.0`. Do not infer historical tags or dates.
- The gameplay baseline was deployed from `23e65b8`; version tracking was added
  afterward. Check deployed metadata rather than assuming all source is live.
- Multiplayer compatibility is `silverpine-moonsway-v4`. This release needs the
  matching frontend and persistent room server; refresh and create a new room.
