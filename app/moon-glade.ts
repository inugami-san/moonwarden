import { CENTER, ROOM, SANCTUARY_CLEARINGS, SANCTUARY_TRAILS, WORLD_HEIGHT, WORLD_WIDTH } from "../server/sanctuary-map";
import { FOREST_PALETTE } from "./forest-art";

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
  ctx.fillStyle = "#233d43";
  ctx.beginPath(); ctx.roundRect(ROOM.left - 12, ROOM.top + 14, width + 24, height + 18, 36); ctx.fill();
  const rim = ctx.createLinearGradient(0, ROOM.top, 0, ROOM.bottom);
  rim.addColorStop(0, "#a7adb0"); rim.addColorStop(.22, "#808e89"); rim.addColorStop(1, "#677d7b");
  ctx.fillStyle = rim; ctx.strokeStyle = "#b2b8b260"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(ROOM.left, ROOM.top, width, height, 26); ctx.fill(); ctx.stroke();

  ctx.save(); ctx.beginPath(); ctx.roundRect(ROOM.left + 12, ROOM.top + 12, width - 24, height - 24, 20); ctx.clip();
  const floor = ctx.createRadialGradient(CENTER.x, CENTER.y, 70, CENTER.x, CENTER.y, 1050);
  floor.addColorStop(0, FOREST_PALETTE.floorLight); floor.addColorStop(.5, FOREST_PALETTE.floorMid); floor.addColorStop(1, FOREST_PALETTE.floorShade);
  ctx.fillStyle = floor; ctx.fillRect(ROOM.left, ROOM.top, width, height);

  // Spacious, independently placed clearings give each destination its own identity.
  for (const clearing of SANCTUARY_CLEARINGS) {
    ctx.save(); ctx.translate(clearing.x, clearing.y); ctx.scale(1, clearing.ry / clearing.rx);
    glow(0, 0, clearing.rx + 45, `${clearing.color}4a`); ctx.restore();
    ellipse(clearing.x, clearing.y + 14, clearing.rx, clearing.ry, "#e1ddbb0b");
  }
  for (let i = 0; i < 210; i++) {
    const x = ROOM.left + 20 + ((i * 173) % (width - 40)), y = ROOM.top + 24 + ((i * 197) % (height - 48));
    ellipse(x, y, 8 + i % 30, 3 + i % 8, i % 2 ? "#d1dbab0c" : "#1d4c3a09");
  }
  // Broad, low-contrast pigment strokes give the ground painterly variation.
  // This entire surface is baked once; none of these marks are collision props.
  for (let i = 0; i < 310; i++) {
    const x = ROOM.left + 16 + (i * 271 % (width - 32)), y = ROOM.top + 16 + (i * 193 % (height - 32));
    ellipse(x, y, 18 + i % 39, 4 + i % 11, ["#c7bbd215", "#d1c8b316", "#415f6310", "#9dac901a"][i % 4]);
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 2900; i++) {
    const x = ROOM.left + 14 + (i * 137.7 % (width - 28)), y = ROOM.top + 14 + (i * 73.9 % (height - 28));
    ctx.strokeStyle = ["#e1dccb1c", "#3f565e18", "#b8b2c51c", "#c1c5aa20"][i % 4]; ctx.lineWidth = .5 + i % 3 * .4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2 + i % 6, y - 1 - i % 2); ctx.stroke();
  }

  // Wide roads are passable ground, never extra invisible walls or shrubs.
  const trail = (points: readonly number[], trailWidth: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineWidth = trailWidth;
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]); ctx.stroke();
  };
  for (const { points, width: trailWidth } of SANCTUARY_TRAILS) {
    trail(points, trailWidth + 25, "#c9c0b012"); trail(points, trailWidth, "#d2c9b13d");
    trail(points, trailWidth - 26, "#e0d7c221"); trail(points, trailWidth - 48, "#ece1cf15");
  }
  // Sparse ground fern strokes, leaves and gravel: visibly flat and walkable.
  for (let i = 0; i < 230; i++) {
    const x = ROOM.left + 26 + i * 97 % (width - 52), y = ROOM.top + 30 + i * 211 % (height - 60);
    ctx.strokeStyle = i % 3 ? "#c6ceba35" : "#d6c8b640"; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(x - 5, y + 1); ctx.quadraticCurveTo(x, y - 4, x + 5, y - 1); ctx.stroke();
    ellipse(x + 4, y - 1, 2.4, .8, i % 2 ? "#d4c4b050" : "#525e6950");
  }
  // Small floor inlays read as texture, rather than confusable collision props.
  for (let i = 0; i < 168; i++) {
    const x = 170 + i * 137 % 1570, y = 190 + i * 73 % 790;
    ctx.fillStyle = i % 3 ? "#e6e1bd12" : "#e7ebce20";
    ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 5, y - 4);
    ctx.lineTo(x + 13, y + 2); ctx.lineTo(x - 4, y + 6); ctx.closePath(); ctx.fill();
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
  glow(CENTER.x, CENTER.y, 210, "#e6d6ba3d"); ellipse(CENTER.x, CENTER.y, 124, 84, "#dcd2c22b");
  ctx.strokeStyle = "#e3e6c167"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(CENTER.x, CENTER.y, 124, 84, 0, .15, Math.PI * 1.85); ctx.stroke();
  ellipse(CENTER.x - 5, CENTER.y - 4, 39, 32, "#e9e4d272"); ellipse(CENTER.x + 8, CENTER.y - 14, 35, 29, "#8c9d9c");

  ctx.textAlign = "center"; ctx.font = "700 12px ui-monospace, monospace"; ctx.fillStyle = "#e5ecd19c";
  for (const [label, x, y] of [
    ["FROST HOLLOW", 375, 382], ["FALLEN SHRINE", 960, 405], ["OWL WATCH", 1536, 354],
    ["WILLOW GROVE", 337, 710], ["MOONWELL", 1060, 946], ["SUNKEN CLOISTER", 1630, 766],
  ] as const) ctx.fillText(label, x, y);
  ctx.font = "600 10px ui-monospace, monospace"; ctx.fillStyle = "#e9ecd080";
  ctx.fillText("WARDEN COURTYARD", CENTER.x, CENTER.y + 66); ctx.restore();

  // Decorative trees stay outside the play boundary. Actual trunks are shared data.
  const pine = (x: number, y: number, height: number) => {
    ctx.save(); ctx.translate(x, y); ellipse(7, 5, height * .23, 10, "#1a364750");
    ctx.fillStyle = "#6b6651"; ctx.fillRect(-3, -height * .65, 6, height * .68);
    for (let tier = 0; tier < 4; tier++) {
      const tip = -height + tier * height * .19, spread = height * (.17 + tier * .034);
      const needles = ctx.createLinearGradient(-spread, tip, spread, tip + 44);
      needles.addColorStop(0, "#a1b1b0"); needles.addColorStop(.5, "#718b85"); needles.addColorStop(1, "#4c686d");
      ctx.fillStyle = needles; ctx.beginPath(); ctx.moveTo(0, tip);
      ctx.bezierCurveTo(-spread * .15, tip + 17, -spread * .9, tip + 28, -spread, tip + height * .33);
      ctx.quadraticCurveTo(0, tip + height * .26, spread, tip + height * .33);
      ctx.bezierCurveTo(spread * .85, tip + 25, spread * .15, tip + 17, 0, tip); ctx.fill();
      ctx.strokeStyle = "#d9d5cf2e"; ctx.lineWidth = .8;
      for (let needle = 0; needle < 13; needle++) {
        const ny = tip + 10 + needle * height * .019, nx = spread * (needle / 16);
        ctx.beginPath(); ctx.moveTo(-nx, ny + 2); ctx.lineTo(0, ny - 3); ctx.lineTo(nx * .8, ny + 1); ctx.stroke();
      }
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
    glow(x, y, 14, "#e1ecc55c"); ellipse(x, y, 4, 2.8, "#d2deb2");
    ctx.fillStyle = "#8da58d"; ctx.fillRect(x - 1, y, 2, 4);
  }
  ctx.textAlign = "center"; ctx.font = "600 12px Georgia, serif"; ctx.fillStyle = "#dce7d0b0";
  ctx.fillText("SILVERPINE MOON GLADE  ·  A FOREST WORTH RESTORING", CENTER.x, 1105);
  ctx.restore();
}
