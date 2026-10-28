import { CENTER, ROOM, SANCTUARY_CLEARINGS, SANCTUARY_TRAILS, WORLD_HEIGHT, WORLD_WIDTH } from "../server/sanctuary-map";
import { FOREST_PALETTE } from "./forest-art";
import { drawForestAsset, FOREST_GRASS_PATCHES } from "./forest-sprites";

/** A full-size world floor baked once. The camera crops it; the forest is not scaled up. */
export function drawMoonGlade(ctx: CanvasRenderingContext2D) {
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  const glow = (x: number, y: number, radius: number, color: string) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, `${color.slice(0, 7)}00`);
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  sky.addColorStop(0, "#4c526c"); sky.addColorStop(.42, "#9296ab"); sky.addColorStop(1, "#5d747b");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  glow(1535, 44, 200, "#f5efca9c"); ellipse(1535, 44, 37, 37, "#f4efd3");

  // The skyline lives beyond the playable plateau, not behind player silhouettes.
  for (let ridge = 0; ridge < 3; ridge++) {
    ctx.fillStyle = ["#9694ab", "#777f97", "#5a7181"][ridge];
    ctx.beginPath(); ctx.moveTo(0, 155);
    for (let i = 0; i <= 13; i++) ctx.lineTo(i * 160, 32 + ridge * 35 + Math.sin(i * 2.15 + ridge) * 31);
    ctx.lineTo(WORLD_WIDTH, 265); ctx.lineTo(0, 265); ctx.closePath(); ctx.fill();
  }

  const width = ROOM.right - ROOM.left, height = ROOM.bottom - ROOM.top;
  // A continuous visible rim matches authority boundaries exactly.
  ctx.fillStyle = "#182d3b";
  ctx.beginPath(); ctx.roundRect(ROOM.left - 12, ROOM.top + 14, width + 24, height + 18, 36); ctx.fill();
  const rim = ctx.createLinearGradient(0, ROOM.top, 0, ROOM.bottom);
  rim.addColorStop(0, "#536f76"); rim.addColorStop(.22, "#3d5863"); rim.addColorStop(1, "#293e4c");
  ctx.fillStyle = rim; ctx.strokeStyle = "#8aada233"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(ROOM.left, ROOM.top, width, height, 26); ctx.fill(); ctx.stroke();

  ctx.save(); ctx.beginPath(); ctx.roundRect(ROOM.left + 12, ROOM.top + 12, width - 24, height - 24, 20); ctx.clip();
  const floor = ctx.createRadialGradient(CENTER.x, CENTER.y, 70, CENTER.x, CENTER.y, 1050);
  floor.addColorStop(0, FOREST_PALETTE.floorLight); floor.addColorStop(.5, FOREST_PALETTE.floorMid); floor.addColorStop(1, FOREST_PALETTE.floorShade);
  ctx.fillStyle = floor; ctx.fillRect(ROOM.left, ROOM.top, width, height);

  // Spacious, independently placed clearings give each destination its own identity.
  for (const clearing of SANCTUARY_CLEARINGS) {
    ctx.save(); ctx.translate(clearing.x, clearing.y); ctx.scale(1, clearing.ry / clearing.rx);
    glow(0, 0, clearing.rx + 45, `${clearing.color}1c`); ctx.restore();
    ellipse(clearing.x, clearing.y + 14, clearing.rx, clearing.ry, "#88aaa609");
  }
  for (let i = 0; i < 210; i++) {
    const x = ROOM.left + 20 + ((i * 173) % (width - 40)), y = ROOM.top + 24 + ((i * 197) % (height - 48));
    ellipse(x, y, 8 + i % 30, 3 + i % 8, i % 2 ? "#82ad9212" : "#163b471c");
  }
  // Broad, low-contrast pigment strokes give the ground painterly variation.
  // This entire surface is baked once; none of these marks are collision props.
  for (let i = 0; i < 310; i++) {
    const x = ROOM.left + 16 + (i * 271 % (width - 32)), y = ROOM.top + 16 + (i * 193 % (height - 32));
    ellipse(x, y, 18 + i % 39, 4 + i % 11, ["#789d9718", "#496e7130", "#253c5926", "#84a58a16"][i % 4]);
  }
  // Soft moss islands with feathered, irregular edges. All baked ground paint:
  // no wall, light source, visibility effect or per-frame texture work.
  for (let i = 0; i < 100; i++) {
    const x = ROOM.left + 45 + (i * 283 % (width - 90));
    const y = ROOM.top + 46 + (i * 179 % (height - 92));
    const rx = 20 + i % 7 * 6, ry = 9 + i % 5 * 3;
    for (let edge = 3; edge >= 0; edge--) {
      ellipse(x + Math.sin(i * 2.7 + edge) * 8, y + Math.cos(i + edge) * 3,
        rx + edge * 5, ry + edge * 2, ["#68a3970b", "#183f4820", "#6b9c8120"][i % 3]);
    }
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 2900; i++) {
    const x = ROOM.left + 14 + (i * 137.7 % (width - 28)), y = ROOM.top + 14 + (i * 73.9 % (height - 28));
    ctx.strokeStyle = ["#9bbdb61b", "#18333f22", "#7196931c", "#acc59c18"][i % 4]; ctx.lineWidth = .5 + i % 3 * .4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2 + i % 6, y - 1 - i % 2); ctx.stroke();
  }

  // Wide roads are passable ground, never extra invisible walls or shrubs.
  const trail = (points: readonly number[], trailWidth: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineWidth = trailWidth;
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]); ctx.stroke();
  };
  for (const { points, width: trailWidth } of SANCTUARY_TRAILS) {
    trail(points, trailWidth + 28, "#1d364c22"); trail(points, trailWidth + 12, "#647b6b25");
    trail(points, trailWidth, "#9c897444"); trail(points, trailWidth - 24, "#b6a08425");
    trail(points, trailWidth - 48, "#c0ac8e16");
    // Broken soil brushwork follows the real curves, not a separate fake path.
    for (let step = 0; step < 60; step++) {
      const t = step / 59, s = 1 - t;
      const px = s ** 3 * points[0] + 3 * s * s * t * points[2] + 3 * s * t * t * points[4] + t ** 3 * points[6];
      const py = s ** 3 * points[1] + 3 * s * s * t * points[3] + 3 * s * t * t * points[5] + t ** 3 * points[7];
      const shift = Math.sin(step * 5.3 + points[0]) * trailWidth * .32;
      ellipse(px + shift, py + Math.cos(step * 2.7) * 12, 3 + step % 9, 1 + step % 3,
        step % 2 ? "#d1b89712" : "#31484e25");
    }
  }
  // Sparse ground fern strokes, leaves and gravel: visibly flat and walkable.
  for (let i = 0; i < 230; i++) {
    const x = ROOM.left + 26 + i * 97 % (width - 52), y = ROOM.top + 30 + i * 211 % (height - 60);
    ctx.strokeStyle = i % 3 ? "#87b8a238" : "#b3a48130"; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(x - 5, y + 1); ctx.quadraticCurveTo(x, y - 4, x + 5, y - 1); ctx.stroke();
    ellipse(x + 4, y - 1, 2.4, .8, i % 2 ? "#a3927650" : "#263c4a60");
  }
  // Small floor inlays read as texture, rather than confusable collision props.
  for (const patch of FOREST_GRASS_PATCHES) {
    drawForestAsset(ctx, patch.asset, patch.x, patch.y, patch.width, patch.width * .48);
  }
  for (let i = 0; i < 168; i++) {
    const x = 170 + i * 137 % 1570, y = 190 + i * 73 % 790;
    ellipse(x, y, 2 + i % 4, 1 + i % 2, i % 3 ? "#b4b6a72b" : "#203d4d40");
  }

  // Frost Hollow: icy fern mosaics, leaving the actual shrine approachable.
  for (const [x, y, rx, ry] of [[246, 292, 31, 16], [495, 282, 35, 18], [240, 362, 24, 13], [492, 366, 26, 14]]) {
    ellipse(x, y, rx, ry, "#c4eded24"); ctx.strokeStyle = "#e0f7ef38"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // Starlight Archive: celestial rings are floor, with open approaches.
  ctx.strokeStyle = "#ece9ca48"; ctx.lineWidth = 1.6;
  for (const [rx, ry] of [[100, 54], [68, 36], [36, 19]]) {
    ctx.beginPath(); ctx.ellipse(960, 300, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    ellipse(960 + Math.cos(angle) * 100, 300 + Math.sin(angle) * 54, 3.8, 2.6, "#f1efd178");
  }
  // Fallen Shrine: a flat, broken crescent mosaic. It is ground, not a new collider.
  ctx.save(); ctx.translate(960, 265);
  ctx.strokeStyle = "#dfcfec88"; ctx.lineWidth = 8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.ellipse(0, 0, 76, 39, -.12, .2, 2.9); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, 76, 39, -.12, 3.35, 5.6); ctx.stroke();
  ctx.strokeStyle = "#78648780"; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-55 + i * 27, 36); ctx.lineTo(-45 + i * 27, 45); ctx.lineTo(-51 + i * 27, 51); ctx.stroke(); }
  ctx.restore();
  // Owl Watch: gold leaves instead of a cluttered second tree wall.
  for (let i = 0; i < 28; i++) {
    const x = 1390 + i * 53 % 318, y = 230 + i * 41 % 170;
    ellipse(x, y, 3.6 + i % 2, 2, i % 2 ? "#e3d7a447" : "#e3c7844d");
  }
  // Deep Root Grotto: an open spore ring; actual trees use shared collision art.
  for (let i = 0; i < 18; i++) {
    const angle = i / 18 * Math.PI * 2;
    ellipse(322 + Math.cos(angle) * 90, 756 + Math.sin(angle) * 48, 3.2, 2.2, "#c2f0c85c");
  }
  // Willow Grove: pale leaf-shaped floor inlays make the clearing recognizable at a glance.
  ctx.save(); ctx.translate(350, 812);
  for (let i = 0; i < 7; i++) {
    const angle = i / 7 * Math.PI * 2;
    ctx.save(); ctx.translate(Math.cos(angle) * 91, Math.sin(angle) * 44); ctx.rotate(angle);
    ctx.fillStyle = "#e4d8b253"; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.quadraticCurveTo(0, -12, 16, 0); ctx.quadraticCurveTo(0, 12, -16, 0); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  // The Moonwell's broad crescent reflection is a visual landmark; all water remains walkable.
  ellipse(1060, 854, 74, 41, "#5b91a668");
  ctx.strokeStyle = "#dfebd991"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(1060, 854, 49, 25, 0, .35, 2.8); ctx.stroke();
  // Shallow reflective floor basins are decorative, never impassable water.
  for (const [x, y, rx, ry] of [[1184, 896, 74, 34], [1610, 706, 55, 28]]) {
    ellipse(x, y + 2, rx + 6, ry + 4, "#36595c30"); ellipse(x, y, rx, ry, "#82b9b866");
    ellipse(x - rx * .22, y - ry * .2, rx * .54, ry * .4, "#d5ede841");
    ctx.strokeStyle = "#d3e4c84f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ellipse(x + rx * .3, y + ry * .18, 7, 4, "#bad3aa91");
  }
  // A welcoming central meeting place stays open for player movement.
  glow(CENTER.x, CENTER.y, 210, "#8bc9c522"); ellipse(CENTER.x, CENTER.y, 124, 84, "#78968b25");
  ctx.strokeStyle = "#adc3ab50"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(CENTER.x, CENTER.y, 124, 84, 0, .15, Math.PI * 1.85); ctx.stroke();
  ellipse(CENTER.x - 5, CENTER.y - 4, 39, 32, "#71949288"); ellipse(CENTER.x + 8, CENTER.y - 14, 35, 29, "#53757c");

  ctx.textAlign = "center"; ctx.font = "700 12px ui-monospace, monospace"; ctx.fillStyle = "#e5ecd19c";
  for (const [label, x, y] of [
    ["FROST HOLLOW", 375, 382], ["FALLEN SHRINE", 960, 405], ["OWL WATCH", 1536, 354],
    ["WILLOW GROVE", 337, 710], ["MOONWELL", 1060, 946], ["SUNKEN CLOISTER", 1630, 766],
  ] as const) ctx.fillText(label, x, y);
  ctx.font = "600 10px ui-monospace, monospace"; ctx.fillStyle = "#e9ecd080";
  ctx.fillText("WARDEN COURTYARD", CENTER.x, CENTER.y + 66); ctx.restore();

  // Decorative canopy mushrooms stay outside the play boundary. Actual trunks are shared data.
  const pine = (x: number, y: number, height: number) => {
    if (drawForestAsset(ctx, Math.floor(x + y) % 3, x, y + 4, height * 1.12, height)) return;
    ctx.save(); ctx.translate(x, y); ellipse(7, 5, height * .23, 10, "#10173066");
    ctx.fillStyle = "#5c6082"; ctx.fillRect(-4, -height * .58, 8, height * .62);
    for (let tier = 0; tier < 2; tier++) {
      const tip = -height * (.92 - tier * .24), spread = height * (.26 - tier * .06);
      const capGrad = ctx.createLinearGradient(-spread, tip, spread, tip + 34);
      capGrad.addColorStop(0, "#4c6edb"); capGrad.addColorStop(.55, "#32499e"); capGrad.addColorStop(1, "#1e2759");
      ctx.fillStyle = capGrad; ctx.beginPath(); ctx.moveTo(0, tip);
      ctx.bezierCurveTo(-spread * .45, tip + 4, -spread * 1.05, tip + 16, -spread, tip + height * .26);
      ctx.quadraticCurveTo(0, tip + height * .32, spread, tip + height * .26);
      ctx.bezierCurveTo(spread * 1.05, tip + 16, spread * .45, tip + 4, 0, tip); ctx.fill();
      ellipse(0, tip + height * .26, spread * .78, height * .055, "#3ef3ff66");
      ellipse(-spread * .34, tip + height * .13, spread * .16, height * .038, "#6dfaffd8");
      ellipse(spread * .28, tip + height * .15, spread * .13, height * .032, "#6dfaffd8");
      ellipse(0, tip + height * .08, spread * .18, height * .04, "#a8ffffe0");
    }
    ctx.restore();
  };
  for (let i = 0; i < 25; i++) pine(32 + i * 77, 96, 72 + i % 3 * 12);
  for (let i = 0; i < 11; i++) {
    pine(42 + i % 2 * 12, 220 + i * 80, 95 + i % 3 * 10);
    pine(1866 + i % 2 * 10, 205 + i * 80, 96 + i % 3 * 11);
  }
  for (let i = 0; i < 22; i++) pine(155 + i * 76, 1134, 64 + i % 2 * 12);
  for (let i = 0; i < 40; i++) {
    const x = 174 + i * 83 % 1580, y = i % 2 ? 1063 : 92;
    glow(x, y, 16, "#3ef3ff5c");
    ctx.fillStyle = "#5c6082"; ctx.fillRect(x - 1.2, y, 2.4, 4.5);
    ellipse(x, y, 4.8, 3.1, "#3553b8");
    ellipse(x - 1.2, y - .5, 1.4, .9, "#7ef9ff");
    ellipse(x + 1.3, y + .2, 1.1, .8, "#7ef9ff");
  }
  ctx.textAlign = "center"; ctx.font = "600 12px Georgia, serif"; ctx.fillStyle = "#dce7d0b0";
  ctx.fillText("SILVERPINE MOON GLADE  ·  A FOREST WORTH RESTORING", CENTER.x, 1105);
  ctx.restore();
}
