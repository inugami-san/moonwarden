# Ordeal Deck

Ordeal Deck is a polished single-room social deduction playtest set aboard the
SS Acheron. It runs entirely in the browser with a procedurally rendered 2D
Canvas world and autonomous AI crew.

## Included gameplay

- Four to eight players with exactly one privately assigned Impostor
- Forced Crewmate, forced Impostor, and random role test modes
- Fifteen-second Calm, three-second warning, and ten-second Ordeal phases
- Total Blackout and Thick Sea Fog visibility hazards
- Flashlight cones, five-second flares, and proximity sonar
- Shared task progress, item recharge, fake Impostor tasks, and dummy items
- Ordeal-only melee kills, jelly puddles, reporting, emergency meetings, voting,
  ejection, task victory, and parity victory
- AI navigation, task work, hunting, item use, body discovery, self-reporting,
  and weighted voting
- Responsive keyboard, mouse, and touch controls

## Run locally

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server.

## Controls

| Action | Control |
| --- | --- |
| Move | `WASD` or arrow keys |
| Aim | Mouse |
| Work a console | Hold `E` |
| Select gear | `1`, `2`, `3` |
| Use gear | `F` or right-click |
| Report / emergency | `R` |
| Impostor kill | `Q` or `Space` |

## Verify

```bash
npm run build
npm test
```

The app uses the bundled vinext/Vite runtime and is compatible with the Sites
hosting target declared in `.openai/hosting.json`.
