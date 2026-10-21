import { CENTER, ROOM, SANCTUARY_CLEARINGS, SANCTUARY_TRAILS, WORLD_HEIGHT, WORLD_WIDTH } from "../server/sanctuary-map";

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
  sky.addColorStop(0, "#344767"); sky.addColorStop(.42, "#778c9a"); sky.addColorStop(1, "#304c55");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  glow(1535, 44, 200, "#f5efca9c"); ellipse(1535, 44, 37, 37, "#f4efd3");

  // The skyline lives beyond the playable plateau, not behind player silhouettes.
  for (let ridge = 0; ridge < 3; ridge++) {
    ctx.fillStyle = ["#7887a3", "#596f88", "#3c5b6c"][ridge];
    ctx.beginPath(); ctx.moveTo(0, 155);
    for (let i = 0; i <= 13; i++) ctx.lineTo(i * 160, 32 + ridge * 35 + Math.sin(i * 2.15 + ridge) * 31);
    ctx.lineTo(WORLD_WIDTH, 265); ctx.lineTo(0, 265); ctx.closePath(); ctx.fill();
  }

  const width = ROOM.right - ROOM.left, height = ROOM.bottom - ROOM.top;
  // A continuous visible rim matches authority boundaries exactly.
  ctx.fillStyle = "#233d43";
  ctx.beginPath(); ctx.roundRect(ROOM.left - 12, ROOM.top + 14, width + 24, height + 18, 36); ctx.fill();
  const rim = ctx.createLinearGradient(0, ROOM.top, 0, ROOM.bottom);
  rim.addColorStop(0, "#b9c1a5"); rim.addColorStop(.22, "#829a7e"); rim.addColorStop(1, "#5c7d6b");
  ctx.fillStyle = rim; ctx.strokeStyle = "#c0c9ad"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(ROOM.left, ROOM.top, width, height, 26); ctx.fill(); ctx.stroke();

  ctx.save(); ctx.beginPath(); ctx.roundRect(ROOM.left + 12, ROOM.top + 12, width - 24, height - 24, 20); ctx.clip();
  const floor = ctx.createRadialGradient(CENTER.x, CENTER.y, 70, CENTER.x, CENTER.y, 1050);
  floor.addColorStop(0, "#8eaa8d"); floor.addColorStop(.5, "#71977f"); floor.addColorStop(1, "#4e796d");
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

  // Wide roads are passable ground, never extra invisible walls or shrubs.
  const trail = (points: readonly number[], trailWidth: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineWidth = trailWidth;
    ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]); ctx.stroke();
  };
  for (const { points, width: trailWidth } of SANCTUARY_TRAILS) {
    trail(points, trailWidth + 25, "#c5c9a014"); trail(points, trailWidth, "#cbd0b140");
    trail(points, trailWidth - 26, "#d4d4b624"); trail(points, trailWidth - 48, "#dfe0c315");
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
  // Shallow reflective floor basins are decorative, never impassable water.
  for (const [x, y, rx, ry] of [[1184, 896, 74, 34], [1610, 706, 55, 28]]) {
    ellipse(x, y + 2, rx + 6, ry + 4, "#36595c30"); ellipse(x, y, rx, ry, "#82b9b866");
    ellipse(x - rx * .22, y - ry * .2, rx * .54, ry * .4, "#d5ede841");
    ctx.strokeStyle = "#d3e4c84f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ellipse(x + rx * .3, y + ry * .18, 7, 4, "#bad3aa91");
  }
  // A welcoming central meeting place stays open for player movement.
  glow(CENTER.x, CENTER.y, 210, "#e7e3b648"); ellipse(CENTER.x, CENTER.y, 124, 84, "#d9dfba30");
  ctx.strokeStyle = "#e3e6c167"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(CENTER.x, CENTER.y, 124, 84, 0, .15, Math.PI * 1.85); ctx.stroke();
  ellipse(CENTER.x - 5, CENTER.y - 4, 39, 32, "#e9eccb81"); ellipse(CENTER.x + 8, CENTER.y - 14, 35, 29, "#8cae91");

  ctx.textAlign = "center"; ctx.font = "700 12px ui-monospace, monospace"; ctx.fillStyle = "#e5ecd19c";
  for (const [label, x, y] of [
    ["FROST HOLLOW", 375, 382], ["STARLIGHT ARCHIVE", 960, 405], ["OWL WATCH", 1536, 354],
    ["DEEP ROOT GROTTO", 337, 710], ["MOONWELL SPRINGS", 1230, 946], ["SUNKEN CLOISTER", 1630, 766],
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
      needles.addColorStop(0, "#9ab7a2"); needles.addColorStop(.5, "#5b8978"); needles.addColorStop(1, "#3d6c63");
      ctx.fillStyle = needles; ctx.beginPath(); ctx.moveTo(0, tip);
      ctx.bezierCurveTo(-spread * .15, tip + 17, -spread * .9, tip + 28, -spread, tip + height * .33);
      ctx.quadraticCurveTo(0, tip + height * .26, spread, tip + height * .33);
      ctx.bezierCurveTo(spread * .85, tip + 25, spread * .15, tip + 17, 0, tip); ctx.fill();
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
