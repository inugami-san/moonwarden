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
- Permanently sealed completed shrines, shared task progress, and deceptive Impostor tasks
- Quick arithmetic and constellation-link shrine puzzles, including fake Impostor versions
- One Impostor strike per Ordeal with a global high-impact kill cinematic, private Impostor Moon Sight, jelly puddles, reporting, emergency meetings, voting,
  ejection, task victory, and parity victory
- Phase-aware background music that crossfades between the gentle normal-flow theme and hostile Ordeal theme, preserving each track's position with an in-game BGM toggle
- Living-player meeting chat with contextual AI discussion for the local playtest
- Private death reveal identifying the killer before the eliminated player spectates
- AI navigation, task work, hunting, item use, body discovery, self-reporting,
  and weighted voting
- Responsive keyboard, mouse, and touch controls
- **Real-time WebSocket Multiplayer**: Room-based multiplayer with 4-letter codes, player nickname & slime/hat customization, waiting room roster, host controls with optional AI bot fill, 20Hz authoritative tick, player position interpolation, real-time meeting chat, and synchronized voting

## Run locally

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000` in your browser.

### Multiplayer
To play multiplayer with friends or across multiple browser tabs:
1. Select the **⚡ MULTIPLAYER** tab in the lobby.
2. Customize your warden nickname, slime color, and hat.
3. Click **CREATE ROOM** to generate a 4-letter room code (or enter a friend's code and click **JOIN**).
4. As the host, choose your target party size (4–8 slots) and whether to fill empty slots with AI bots, then click **START MATCH**.

A standalone WebSocket server is also available via:
```bash
npm run ws # runs WebSocket server on port 3001
```

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
```

The app uses the bundled vinext/Vite runtime and is compatible with the Sites
hosting target declared in `.openai/hosting.json`.
