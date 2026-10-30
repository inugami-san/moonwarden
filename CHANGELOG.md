# Moonwarden changelog

The game is in public beta. Versions follow `MAJOR.MINOR.PATCH`; release numbers
are separate from the multiplayer compatibility identifier. This file describes
source releases, not proof that a particular server has been deployed.

## [Unreleased]

## [0.8.0] - 2026-10-30

### Direction-aware cat wardrobe

- Refit all eleven accessories for front, diagonal, side and rear headings,
  with separate back/body/front layers shared by gameplay, lobby portraits and
  Hollow capture. Partially visible cats fade as one assembled character;
  anonymous silhouettes still hide every accessory.
- Added Dewdrop Pendant, Fern Scarf and Mushroom Cap, and a single shared
  cosmetic catalog for wardrobe choices, labels, client validation and the room
  server. Existing accessory IDs and the default Moonbell Collar are preserved.
- Added a development-only accessory inspection mode with direction, animation,
  reduced-motion and worn-vs-icon review controls.
- Multiplayer now requires `silverpine-wardrobe-v9` on both the frontend and
  existing room server so cached clients cannot misrender the new cosmetic IDs.
  No gameplay, collision, visibility, role or reward rules changed.

## [0.7.2] - 2026-10-30

### Living Rootwake and dramatic role entrances

- Restored a more dramatic role entrance: staged shadow-to-cat reveal, opening
  forest curtains, moon crest, distinct Warden/Hollow title impacts, warm Warden
  light and a crimson Hollow eclipse. Tapping the cat triggers a responsive hop
  or shadow pulse with a private, gesture-unlocked sound accent. The existing
  4.9s reveal, role assignment, cosmetics and skip action remain unchanged;
  keyboard focus and reduced-motion support cover both controls.

- Reworked Rootwake's neon grid into world-anchored braided roots with shaded
  bark, subdued moonlit veins, branching warning fissures, staggered eruption,
  short earth particles, curling doorway tendrils and a smoother final retreat.
  Cached eight material variants and culled offscreen knots; reduced motion
  removes lift, dust and drifting particles. Existing wall geometry, collision
  timing, halfway door opening and chamber privacy are unchanged.
- Added a development-only `/dev/rootwake` replay/scrubber using the same live
  renderer, with Warden chamber and reduced-motion review options.

## [0.7.1] - 2026-10-30

### Quiet gameplay HUD

- Reduced the persistent objective to a small Forest progress pill. Role goals
  and instructions open only on request; Map and Notes are compact icon controls.
- Removed empty inventory panels, duplicate completed-shrine notices, scenery
  captions and the bottom controls rail. Nearby shrines use one short action row;
  the hold gauge appears while attuning, and duet runes only after joining.
- Hollow skills now activate directly from the action bar, without the Tricks
  menu or tap explanations. Gear and utilities appear when usable in an Ordeal;
  cooldowns stay on the controls. Successful skill use no longer adds an
  instruction toast over its visual effect.
- Locked reporting no longer opens a tooltip. Body-report exceptions, the first
  Ordeal unlock and the shared 60s emergency cooldown remain enforced.
- Kept help, skill trade-offs and Privacy settings available inside Settings.
  Compact landscape controls retain 44px touch targets and reduced-motion support.
- No gameplay balance, collision, visibility or multiplayer protocol changes;
  the existing v8 room server remains compatible.

## [0.7.0] - 2026-10-29

### First-time player clarity

- Added a short, skippable private introduction: move to a shrine, complete a
  moon-rune ritual, earn a Glowing Mushroom and use it in a safe blackout.
  Finishing or explicitly skipping is remembered on that browser/device;
  How to Play offers a replay. It never overlays an active room or match.
- Replaced overlapping role/preparation/task labels with one phase-specific
  objective, restoration meter and expandable win explanation. Equipment leads
  with earned items; the full catalog and advanced Hollow tricks are secondary.
- Consolidated shrine rewards into one gear handoff while preserving anonymous
  restoration settlement. Added nearby Sun/Moon duet invitations and clearer
  turn-taking, duration and audible-risk guidance, without exposing other roles.
- Matched introductory touch movement to the live floating joystick and taught
  hold-to-restore with the same timing/gauge. Completion/skip preferences stay
  valid; no forced replay after this update.
- Added an optional private Hollow lesson in How to Play: fake ritual, shared
  Sight/Echo choice and one strike. It returns to the guide and never touches
  live room state or saved introduction preferences.
- Simplified the meter to "Forest restored", explained Harmonize as a duet,
  enlarged help touch targets, and made locked reporting explainable on tap.
  The first confirmed gear reward briefly highlights its Use control; the cue
  expires, never repeats within that match, and respects reduced motion.
- Kept win rules, shrine timing/rewards, visibility gates and multiplayer v8
  unchanged. The existing room server remains compatible.

### Painted-cat movement and forest ceremonies

- Reworked the live painted-paw rig into a staggered four-beat walk with longer
  planted support, smooth toe-off/touchdown and stable toe anchoring. Added a
  short decaying finish when stopping, gentler shoulder transfer and heading
  hysteresis. Travel still drives the gait; physics and collisions are unchanged.
- Added a large live cat preview inside room customization. Cosmetic changes
  repaint without rebuilding portrait observers/listeners; cached art stays
  visible while loading and wardrobe views omit unused silhouette rendering.
- Replaced the scanner-style role reveal with a moonlit forest entrance using
  the chosen cat appearance and clear Warden/Hollow goals. Warden remains the
  friendly role name.
- Replaced legacy procedural characters in live voting/endgame scenes with
  painted cats: a moonward Warden farewell, Hollow shadow unravel, flower-lit
  Warden victory and eclipsed Hollow grove. Official verdicts, neutral/tied
  outcomes, existing timings and audio callbacks are preserved.
- Added local ceremony previews to the development-only `/dev/victory` page.
  Motion is finite and reduced-motion safe; preview routes stay unavailable
  in production.

## [0.6.3] - 2026-10-28

### Moonlit menu theme

- Removed the leftover slime-shaped brand logo; the shared header now uses a
  clean Moonwarden wordmark and release label. Cat previews are unchanged.
- Added a painted full-screen bioluminescent mushroom grove behind the home menu,
  with readable dark negative space, soft mist and fourteen drifting spores.
  Optimized the new 1672×941 background to a ~246 KiB WebP.
- Integrated the cat showcase into the forest instead of a separate geometric
  scene card; matched preview controls to the midnight-teal scenery. Kept the
  primary gold Play button, moon interaction and existing navigation.
- Added phone-specific cropping/readability and reduced-motion/pause support.
  Other menu backgrounds, customization and gameplay remain unchanged.

### Customization layout

- Added a dedicated full seated-cat wardrobe preview, shared with the current
  home artwork and live coat/accessory/eye selections. The preview stays visible
  above controls on portrait phones and beside controls on wider screens.
- Moved Random onto the preview, retained tap-to-greet and reduced-motion support,
  and fitted all accessory choices into compact phone/landscape screens.
- Replaced menu diamond-sparkle glyphs with code-native paw and collar icons,
  including the primary Play action, Customize, preview actions and vacant slots.
  Removed leftover puddle wording from the field guide. No gameplay/server changes.

## [0.6.2] - 2026-10-28

### Fixed

- Removed leftover player-facing slime terminology from vote-out fallbacks,
  home preview quips, coat-color controls and Hollow ability tooltips, including
  accessibility labels. A tied/skipped vote now opens with "The circle" rather
  than naming a nonexistent character.
- Translated exact legacy room-server color/report alerts in the client without
  rewriting player names, chat or unknown errors. Gameplay and the v8 protocol
  are unchanged; the existing v0.6.0 room server remains compatible.

## [0.6.1] - 2026-10-28

### Cat presentation polish

- Replaced tiny walking lobby avatars with face-forward seated close-ups,
  including profile/cosmetic summaries. Increased roster portraits from 45px
  to 76px (30px to 48px in compact landscape); all eight slots remain visible.
- Added device-pixel-aware portrait surfaces up to 672px and a higher-resolution
  seated cache. Hidden menu portraits suspend painting; anonymous silhouettes
  repaint only when needed, with one cancellable animation loop per portrait.
- Unified coat shading across gameplay, home, heads and fallen markers:
  softer saturation, lifted painted midtones, cool shadows, preserved amber
  eyes/blue fabric/white stars. Anonymous material remains color-blind.
- Added richer custom-eye highlights and a side-by-side gameplay/lobby review
  on `/dev/cats`. No movement, collision, role, visibility range or server rules
  changed. Multiplayer remains compatible with the v0.6.0 room server through
  the unchanged `silverpine-trust-v8` protocol.

## [0.6.0] - 2026-10-28

### Changed

- Rebalanced restoration: a 3–4% baseline before the Ordeal multiplier, two
  capped +0.5% follow-up contributions per shrine, and a shared 4% Hollow
  siphon ceiling per cycle. Anonymous four-second settlement remains.
- Added rotating Overgrown Shrines: the first Warden bloom during an Ordeal
  earns +1.5% team restoration; interactive blooms require three seconds of
  exposure and announce a local chant. Personal gear remains available.
- Harmonize is now a minimum-three-second, four-note Sun/Moon duet. Two
  stationary players take turns, either can abandon it, and either role can join.
- Rootwake lasts 12 seconds; marked north/south doors open after six seconds.
  Hollow root crossing makes a neutral sound and no longer bypasses prop bases.
- Added two Moonglare shade pockets that restore close identity inside the same
  pocket, without seeing through cover. Echo Lure emits a moving rustle trail.
- Mirror Pool keeps normal controls and restores original colors at Calm.
- Added a painted open forest loop alongside direct shrine approaches. No new
  invisible colliders or shuffled landmarks were introduced.
- Standard presets allow one Hollow for 4–6 players and up to two for 7–8.
  Meetings have host-selected 60/75/90-second limits (default 75), plus editable
  claim starters explicitly labeled as unverified player statements.
- Includes the local painted-cat, shrine and role/voting art updates from 0.5.0.

Balance timings are beta hypotheses, not a measured promise of match length.
Frontend and room server require the matching `silverpine-trust-v8` protocol.

## [0.5.0] - 2026-10-27

### Changed

- Replaced Warden/Hollow reveal sigils, voting/tally icons and meeting-chat
  avatars with shared painted cat heads. Coat colors and eye choices remain;
  legacy slime-report wording is translated to a fallen-Warden heading.
- Added reference-inspired painted celestial sundials, cat moon-basins and
  four-phase totems, with inactive and glowing activated versions. Shared
  restoration lights the art without claiming personal rewards; locks dim it.
  Kept the half-second completion pulse and raised sealed badges above taller
  art. Placement, collision, puzzles and gameplay visibility are unchanged.
- Enlarged the home spotlight cat independently of gameplay avatars, with a
  square portrait area and a larger compact-landscape size.
- Added a separate painted seated home-menu cat with breathing, blinks and a
  greeting tilt; coat colors, eye choices and fitted accessories remain usable.
  Portrait paints cap at 30fps, pause when hidden and respect reduced motion.
- Replaced the legacy gel devour and CSS victim replay with one shared painted
  cat claw/shadow-capture renderer. Kill limits, reports and visibility gates are
  unchanged. Added a local capture preview/scrubber to `/dev/cats`.
- Added grounded idle shoulder breathing, width-aware paw motion and cached
  blink strips. Side collar bands follow neck perspective; charms hang upright,
  rear pendants stay hidden and seated headwear uses a raised anchor.
- Fixed east/west walk rig slicing through overlapping painted paws and cuffs;
  connected side-profile shapes now move as intact units.
- Added stride-linked shoulder bob, gentle body sway and lean to the painted cat,
  preserving grounded paw trajectories and keeping collars attached to the motion.
- Replaced abrupt walk-frame swaps with a continuous painted-paw rig: stable
  body/head/scarf, alternating paw swing and lift, smooth return to rest, feathered
  hip joints and one-pass fog fading. Added slow playback and A/B controls to the
  local character review. Original poses remain available for comparison/greetings.
- Unified accessory placement inside the character canvas for previews and live
  play, removing the independent CSS collar layer. Home greetings now use two
  grounded paw-lift poses rather than whole-body squash/stretch; tapping is gentler.
- Replaced reportable slime puddles with a non-gory fallen-cat sprite, keeping
  player-color tinting, anonymous concealment and delayed stealth-body timing.
- Added Moonbell/Starlock collars, a Woodland bandana and Moonmoth bow across
  customization, gameplay and room-server cosmetic validation. Smaller, raised
  legacy hats no longer cover the cat's face. Default accessory is Moonbell.
- Made the gameplay header transparent over the arena, removing the branding
  rail while keeping the floating phase timer and Settings/Leave controls.
- Reworked the pale ground into blue-teal forest soil with feathered moss,
  organic pebble/leaf details and warmer worn-earth trails. Reduced milky clearing
  glows and matched courtyard stones/boundary tones to the mushroom forest.
- Added reference-inspired painted bioluminescent mushroom canopies, double-cap
  giants, shaggy fungal trees and low clusters. Sparse walkable grass, fern and
  spore accents dress the ground while preserving open trails. Art is cached;
  collision, navigation, shrine behavior and visibility rules are unchanged.
- Corrected painted-cat paw alignment with per-pose ground and torso registration.
  Walking now follows actual distance traveled; blocked movement, lingering gaze
  and network teleports no longer drive misleading foot motion.
- Replaced the live procedural moon-cat with reference-inspired painted sprites:
  eight directions and four walk frames, shared by gameplay and lobby portraits.
  Preserved coat colors, eye expression choices and anonymous fog silhouettes;
  cached recoloring and alpha-gutter extraction prevent per-frame painting and
  clipped paws. Added an enlarged character review at `/dev/cats`.
  These changes are local, not deployed.

- Refined the live moon-cat character with rounded cheeks, golden expressive eyes,
  shaded coats, star-flecked curled tails, moon scarves and runic cuffs. Gameplay
  and lobby portraits now share one renderer, with articulated eight-direction
  walking, aligned headdresses and anonymous fog silhouettes that retain anatomy
  without revealing color or decorations. A development-only `/dev/cats` review
  page compares the old and new artwork at gameplay scale.
- Replaced the scrolling homepage with full-screen game menus: Play with friends,
  Practice with AI, Customize, and a paginated field guide. Back navigation,
  compact room browsing, safe-area spacing, and responsive layouts prepare the
  interface for a future WebView wrapper.
- Unified practice, customization, and waiting-room screens with the in-game
  midnight-blue, moonlight, and warm-gold palette.
- Meetings open with player cards and discussion side by side, rather than tabs.
  A ten-second discussion countdown precedes voting, enforced in solo play and by
  the room server (including bots). The existing multiplayer meeting remains 45
  seconds total, leaving 35 seconds for voting. Private notes use a small optional
  button. All eight player cards fit without roster scrolling; chat and note
  histories retain their own internal scrolling.
- Curated station homes and cover, Moon/Root/Firefly rituals, Standard/Challenging
  difficulty, and shrine-earned Wisp Step/Watchroot utilities (`silverpine-rituals-v7`).

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
