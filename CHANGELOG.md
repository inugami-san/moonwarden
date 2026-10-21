# Moonwarden changelog

The game is in public beta. Versions follow `MAJOR.MINOR.PATCH`; release numbers
are separate from the multiplayer compatibility identifier. This file describes
source releases, not proof that a particular server has been deployed.

## [Unreleased]

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
