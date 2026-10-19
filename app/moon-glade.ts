/** Baked once per match. Decoration stays outside the existing collision boundary. */
export function drawMoonGlade(ctx: CanvasRenderingContext2D) {
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  const sky = ctx.createLinearGradient(0, 0, 0, 760);
  sky.addColorStop(0, "#273c5a"); sky.addColorStop(.55, "#526d78"); sky.addColorStop(1, "#233e43");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1280, 760);
  const moon = ctx.createRadialGradient(1050, 55, 20, 1050, 55, 160);
  moon.addColorStop(0, "#f6f4d8"); moon.addColorStop(.28, "#e9eed9"); moon.addColorStop(.3, "#e2ecd23d"); moon.addColorStop(1, "#e2ecd200");
  ctx.fillStyle = moon; ctx.fillRect(860, 0, 380, 230);
  // Blue atmospheric ridges, well behind the playable glade.
  for (let ridge = 0; ridge < 3; ridge++) {
    ctx.fillStyle = ["#61778c", "#415d73", "#2c4d5d"][ridge];
    ctx.beginPath(); ctx.moveTo(0, 180);
    for (let i = 0; i <= 9; i++) ctx.lineTo(i * 160, 35 + ridge * 42 + Math.sin(i * 2.1 + ridge) * 40);
    ctx.lineTo(1280, 320); ctx.lineTo(0, 320); ctx.fill();
  }
  // Cliff depth and a continuous raised edge match the server's rectangular limits.
  ctx.fillStyle = "#1d3435"; ctx.beginPath(); ctx.roundRect(66, 87, 1148, 628, 45); ctx.fill();
  const earth = ctx.createLinearGradient(0, 72, 0, 708);
  earth.addColorStop(0, "#b0b79a"); earth.addColorStop(.15, "#647a64"); earth.addColorStop(1, "#354f48");
  ctx.fillStyle = earth; ctx.strokeStyle = "#acb99c"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(76, 72, 1128, 618, 38); ctx.fill(); ctx.stroke();
  const ground = ctx.createRadialGradient(650, 350, 30, 650, 370, 650);
  ground.addColorStop(0, "#6d8b72"); ground.addColorStop(.6, "#527561"); ground.addColorStop(1, "#344e47");
  ctx.fillStyle = ground; ctx.beginPath(); ctx.roundRect(94, 90, 1092, 582, 28); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(96, 92, 1088, 578, 26); ctx.clip();
  // Low-contrast moss islands add texture without confusing movement or silhouettes.
  for (let i = 0; i < 110; i++) {
    const x = 100 + ((i * 173) % 1080), y = 100 + ((i * 97) % 565);
    ellipse(x, y, 12 + i % 40, 4 + i % 12, i % 2 ? "#acc4980c" : "#213e320c");
  }
  // Worn paths connect recognizable landmarks; these are floor, not new obstacles.
  const trail = (points: number[], width: number, color: string) => {
    ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(points[0], points[1]); ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]); ctx.stroke();
  };
  for (const [points, width] of [
    [[116, 402, 430, 330, 690, 480, 1164, 390], 88],
    [[250, 110, 310, 300, 560, 310, 640, 382], 72],
    [[640, 104, 720, 210, 620, 270, 640, 382], 66],
    [[1038, 110, 970, 270, 970, 330, 640, 382], 70],
    [[844, 658, 830, 480, 770, 430, 640, 382], 90],
  ] as [number[], number][]) {
    trail(points, width + 14, "#b3bd9514"); trail(points, width, "#9da98b37"); trail(points, width - 18, "#b6bea226");
  }
  // Soft broken slate fragments: irregular, not a radar grid.
  for (let i = 0; i < 115; i++) {
    const x = 130 + (i * 137 % 1020), y = 140 + (i * 73 % 490);
    ctx.fillStyle = i % 3 ? "#c4c9ad0e" : "#dde2c21b";
    ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 7, y - 5); ctx.lineTo(x + 18, y + 2); ctx.lineTo(x - 4, y + 7); ctx.fill();
  }
  const center = ctx.createRadialGradient(640, 382, 5, 640, 382, 150);
  center.addColorStop(0, "#d9e3bf66"); center.addColorStop(1, "#a6c49d00");
  ctx.fillStyle = center; ctx.fillRect(480, 240, 320, 290);
  ellipse(640, 382, 98, 68, "#ced6b82b");
  ctx.strokeStyle = "#c7d7bb55"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(640, 382, 98, 68, 0, .1, Math.PI * 1.8); ctx.stroke();
  // Crescent cut into the meeting stone.
  ellipse(635, 378, 37, 30, "#e1e6c36b"); ellipse(647, 369, 34, 28, "#789982");
  ctx.restore();
  const pine = (x: number, y: number, height: number) => {
    ctx.save(); ctx.translate(x, y);
    ellipse(8, 6, height * .25, 12, "#122e394a");
    ctx.fillStyle = "#594f3c"; ctx.fillRect(-4, -height * .65, 8, height * .7);
    for (let tier = 0; tier < 4; tier++) {
      const tip = -height + tier * height * .2;
      const spread = height * (.18 + tier * .035);
      const needles = ctx.createLinearGradient(-spread, tip, spread, tip + 50);
      needles.addColorStop(0, "#709584"); needles.addColorStop(.5, "#3e6c5c"); needles.addColorStop(1, "#244c46");
      ctx.fillStyle = needles; ctx.beginPath(); ctx.moveTo(0, tip);
      ctx.bezierCurveTo(-spread * .15, tip + 18, -spread * .9, tip + 30, -spread, tip + height * .34);
      ctx.quadraticCurveTo(0, tip + height * .27, spread, tip + height * .34);
      ctx.bezierCurveTo(spread * .85, tip + 27, spread * .15, tip + 18, 0, tip); ctx.fill();
    }
    ctx.restore();
  };
  for (let i = 0; i < 8; i++) { pine(15 + i * 33, 85, 78 + i % 3 * 19); pine(1090 + i * 29, 90, 90 + i % 3 * 23); }
  for (let i = 0; i < 6; i++) { pine(28 + i % 2 * 25, 250 + i * 86, 96 + i % 3 * 16); pine(1232 + i % 2 * 24, 240 + i * 88, 110 + i % 3 * 12); }
  // Memorable landmarks on the rim, with no hidden collision additions.
  ctx.strokeStyle = "#867d63"; ctx.lineWidth = 18; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(110, 575); ctx.bezierCurveTo(145, 550, 169, 590, 176, 640); ctx.stroke();
  ctx.strokeStyle = "#b6bd9280"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(110, 569); ctx.quadraticCurveTo(150, 563, 167, 621); ctx.stroke();
  // A broken arch above the eastern shrine and the shallow moonwell rim below.
  ctx.strokeStyle = "#adb6a0"; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(1110, 81); ctx.lineTo(1110, 30); ctx.quadraticCurveTo(1154, -2, 1180, 29); ctx.stroke();
  ellipse(844, 695, 74, 20, "#253f42"); ellipse(844, 691, 68, 17, "#a4bba1"); ellipse(844, 690, 55, 11, "#678d90"); ellipse(831, 687, 27, 3, "#dcebd782");
  for (let i = 0; i < 24; i++) {
    const x = 170 + (i * 83 % 940), y = i % 2 ? 704 : 66;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 15);
    glow.addColorStop(0, "#cee6ad55"); glow.addColorStop(1, "#cee6ad00"); ctx.fillStyle = glow; ctx.fillRect(x - 15, y - 15, 30, 30);
    ctx.fillStyle = "#9ebfaf"; ctx.beginPath(); ctx.ellipse(x, y, 5, 3, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 1, y, 2, 5);
  }
  ctx.font = "600 12px Georgia, serif"; ctx.textAlign = "center"; ctx.fillStyle = "#d6e4c999";
  ctx.fillText("MOONWARDEN SANCTUARY  •  SILVERPINE MOON GLADE", 640, 736);
}
