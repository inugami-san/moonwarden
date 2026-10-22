export const SANCTUM_PULSE_SECONDS = 0.5;

export function sanctumPulse(now: number, completedAt?: number) {
  if (completedAt === undefined) return null;
  const age = now - completedAt;
  if (age < 0 || age >= SANCTUM_PULSE_SECONDS) return null;
  const progress = age / SANCTUM_PULSE_SECONDS;
  return { progress, radius: 16 + progress * 42, alpha: (1 - progress) * 0.8 };
}

export type Sanctum = {
  x: number;
  y: number;
  pulse: number;
  /** The local warden has claimed this round's personal ritual reward. */
  completed: boolean;
  /** Shared ward restoration does not close someone else's personal ritual. */
  teamRestored?: boolean;
  completedAt?: number;
  rootClosure?: number;
  label: string;
  reward: "FLASHLIGHT" | "FLARE" | "SONAR";
};

/** Distinct carved silhouettes, with the same readable ritual/seal in front. */
function drawShrineCrown(ctx: CanvasRenderingContext2D, station: Sanctum, locked: boolean, restored: boolean) {
  ctx.save();
  ctx.strokeStyle = locked ? "#79818a" : "#c7c1cd"; ctx.lineWidth = 1.8;
  ctx.fillStyle = locked ? "#606971" : "#9b9caa";
  if (station.label === "OWL TOTEM") {
    ctx.beginPath(); ctx.moveTo(-20, -37); ctx.lineTo(-23, -55); ctx.lineTo(-10, -49);
    ctx.quadraticCurveTo(0, -55, 10, -49); ctx.lineTo(23, -55); ctx.lineTo(20, -37);
    ctx.quadraticCurveTo(0, -28, -20, -37); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = locked ? "#9c9b88" : "#e5c995";
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 9, -43, 4, .2, Math.PI * 1.85); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-3, -40); ctx.lineTo(0, -35); ctx.lineTo(3, -40); ctx.stroke();
  } else if (station.label === "ROOT SEAL") {
    ctx.strokeStyle = locked ? "#6d6a60" : "#aaa087"; ctx.lineWidth = 3;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 13, -36); ctx.bezierCurveTo(side * 26, -47, -side * 7, -58, 0, -50); ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.strokeStyle = locked ? "#8b9292" : "#c5c9d5";
    ctx.beginPath(); ctx.moveTo(0, -49); ctx.lineTo(0, -34); ctx.stroke();
  } else if (station.label === "STAR ALTAR") {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 26, -34); ctx.lineTo(side * 18, -50); ctx.lineTo(side * 5, -47); ctx.stroke();
    }
    ctx.fillStyle = locked ? "#90979c" : "#e0d7ef";
    for (const [x, y] of [[-18, -50], [-5, -47], [5, -47], [18, -50]]) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
  } else {
    // Moonwell, Frost Font and East Ward are open stone fonts with water insets.
    const wide = station.label === "MOONWELL" ? 31 : 24;
    ctx.beginPath(); ctx.ellipse(0, -35, wide, 8, 0, Math.PI * .03, Math.PI * .97); ctx.stroke();
    ctx.fillStyle = locked ? "#637881" : "#b4c6d2";
    ctx.beginPath(); ctx.ellipse(0, -35, wide - 4, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = locked ? "#7e9098" : "#e0dee9"; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.ellipse(-2, -36, wide * .55, 1.8, 0, .3, 2.7); ctx.stroke();
  }
  // Amber reflects restored wards; a temporary lock always dims the matter.
  if (restored && !locked) {
    ctx.strokeStyle = "#e4c59180"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-27, -30); ctx.quadraticCurveTo(0, -40, 27, -30); ctx.stroke();
  }
  ctx.restore();
}

/** Forest matter, carved moonstone, and local light; no screen-shaped station panels. */
export function drawForestSanctum(ctx: CanvasRenderingContext2D, station: Sanctum, time: number, locked: boolean, nearby: boolean) {
  const { completed } = station;
  const restored = station.teamRestored === true || completed;
  const closure = completed ? 1 : Math.max(0, Math.min(1, station.rootClosure ?? Number(locked)));
  const breath = completed ? 0.9 : 0.57 + Math.sin(time * 2.3 + station.pulse) * 0.13;
  const brightness = locked ? 0.16 : breath;
  const completion = sanctumPulse(time, station.completedAt);
  ctx.save();
  ctx.translate(station.x, station.y);

  ctx.fillStyle = "rgba(2,10,14,.42)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 50, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  const halo = ctx.createRadialGradient(0, 1, 4, 0, 1, 54);
  halo.addColorStop(0, completed ? `rgba(231,196,137,${brightness * .28})` : `rgba(192,184,221,${brightness * .25})`);
  halo.addColorStop(1, "rgba(174,162,202,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(-56, -55, 112, 112);

  // A stepped moonstone plinth reads as a destination, rather than a loose rock.
  const plinth = ctx.createLinearGradient(0, 12, 0, 32);
  plinth.addColorStop(0, locked ? "#626b78" : "#b0aeba");
  plinth.addColorStop(1, locked ? "#3a4453" : "#686e83");
  ctx.fillStyle = plinth;
  ctx.strokeStyle = "#263a46";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 24, 43, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = locked ? "#656f7b" : "#9c9fad";
  ctx.beginPath();
  ctx.ellipse(0, 18, 37, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = locked ? "#617477" : restored ? "#e9dab1" : "#b5d3cc";
  ctx.lineWidth = restored ? 2.6 : 1;
  ctx.beginPath();
  ctx.ellipse(0, 18, 34, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Two carved boughs create a recognizable shrine silhouette from a distance.
  for (const side of [-1, 1]) {
    ctx.strokeStyle = locked ? "#4d535d" : "#7e7e8b";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(side * 31, 13);
    ctx.bezierCurveTo(side * 38, -9, side * 30, -38, side * 14, -43);
    ctx.stroke();
    ctx.strokeStyle = locked ? "#67787a" : "#b4c6bf";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(side * 31, 10);
    ctx.bezierCurveTo(side * 35, -9, side * 27, -35, side * 14, -40);
    ctx.stroke();
    ctx.fillStyle = locked ? "#3a4c45" : restored ? "#d6d2ab" : "#8fbaa0";
    ctx.beginPath();
    ctx.ellipse(side * 30, -21, 9, 3.5, side * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  drawShrineCrown(ctx, station, locked, restored);
  // This steady crown rune records shared restoration, not personal ownership.
  ctx.strokeStyle = locked ? "#6f7f82" : restored ? "#e8dcba" : "#c2ddce";
  ctx.lineWidth = restored ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, -40, 8, -Math.PI * 0.65, Math.PI * 0.65);
  ctx.stroke();
  if (restored) {
    ctx.fillStyle = locked ? "#78817a" : "#e8dcba";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 13, -40, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // An irregular moss bed and small stones anchor the shrine in the ground.
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4 + station.pulse;
    const x = Math.cos(angle) * (28 + (i % 3) * 5);
    const y = 14 + Math.sin(angle) * 15;
    const stone = ctx.createLinearGradient(x, y - 6, x + 6, y + 7);
    stone.addColorStop(0, locked ? (i % 2 ? "#536457" : "#65716a") : (i % 2 ? "#84977a" : "#9eafa0"));
    stone.addColorStop(1, locked ? "#26372e" : "#4c6950");
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.ellipse(x, y, 8 + i % 3, 5, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(119,150,101,.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 3);
    ctx.quadraticCurveTo(x, y - 6, x + 4, y - 3);
    ctx.stroke();
  }

  // Open roots curl outward; the same roots fold over the rune when locked.
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const bark = ctx.createLinearGradient(side * 42, 20, side * 9, -25);
    bark.addColorStop(0, "#302d24");
    bark.addColorStop(0.5, "#625a42");
    bark.addColorStop(1, "#3b4431");
    ctx.strokeStyle = bark;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(side * 48, 24);
    ctx.bezierCurveTo(side * 24, 24, side * (44 - closure * 17), -7, side * (35 - closure * 30), -25 - closure * 7);
    ctx.stroke();
    ctx.strokeStyle = "rgba(155,142,100,.27)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(side * 43, 22);
    ctx.bezierCurveTo(side * 26, 20, side * (40 - closure * 17), -8, side * (34 - closure * 29), -26 - closure * 7);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const x = side * (28 + i * 7);
      const y = 10 + i * 4;
      ctx.fillStyle = locked ? "#293c2d" : restored ? "#8caa70" : "#6d945d";
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 7, 2.6, side * -0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const rock = ctx.createLinearGradient(-16, -26, 21, 24);
  rock.addColorStop(0, locked ? "#8a8d9c" : completed ? "#ded5be" : "#c8c3ce");
  rock.addColorStop(0.4, locked ? "#626b7f" : completed ? "#aaa3ae" : "#9c9daa");
  rock.addColorStop(1, locked ? "#3f4d60" : "#666d81");
  ctx.fillStyle = rock;
  ctx.strokeStyle = "rgba(13,26,20,.8)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-23, 21);
  ctx.lineTo(-21, -13);
  ctx.lineTo(-10, -29);
  ctx.lineTo(12, -26);
  ctx.lineTo(23, -11);
  ctx.lineTo(25, 20);
  ctx.quadraticCurveTo(0, 29, -23, 21);
  ctx.fill();
  ctx.stroke();

  // Restrained mineral flecks and chipped planes are stable, not animated noise.
  for (let i = 0; i < 12; i++) {
    const x = -16 + i * 17 % 33, y = -15 + i * 13 % 32;
    ctx.strokeStyle = i % 2 ? "#e9ded338" : "#3c43522e"; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2.6, y - .8); ctx.stroke();
  }
  ctx.strokeStyle = "#e1d5cb5c"; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(-19, -11); ctx.lineTo(-9, -26); ctx.lineTo(10, -23); ctx.stroke();

  ctx.strokeStyle = "rgba(15,35,25,.38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, -26);
  ctx.lineTo(-3, -13);
  ctx.lineTo(-9, -5);
  ctx.moveTo(19, 3);
  ctx.lineTo(11, 7);
  ctx.lineTo(14, 19);
  ctx.stroke();
  ctx.strokeStyle = completed ? `rgba(255,238,185,${locked ? 0.45 : 0.95})` : `rgba(183,230,218,${brightness})`;
  ctx.lineWidth = completed ? 2.8 : 1.8;
  ctx.beginPath();
  ctx.arc(0, -3, 12, -Math.PI * 0.7, Math.PI * (completed ? 1.3 : 0.7));
  if (completed) {
    ctx.moveTo(-6, -3);
    ctx.lineTo(-1, 2);
    ctx.lineTo(7, -9);
  } else {
    ctx.moveTo(-7, 2);
    ctx.lineTo(0, -13);
    ctx.lineTo(7, 2);
    ctx.lineTo(1, 2);
  }
  ctx.stroke();

  // Each station's plants hint at the equipment it supplies.
  for (const side of [-1, 1]) {
    const x = side * 29;
    const y = 18;
    if (station.reward === "FLASHLIGHT") {
      ctx.strokeStyle = "#899b7f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - side * 2, y - 6, x, y - 12);
      ctx.stroke();
      ctx.fillStyle = locked ? "#4a6151" : "#82ab91";
      ctx.beginPath();
      ctx.ellipse(x, y - 12, 8, 4, side * 0.15, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(194,232,192,${brightness * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y - 12, 7, 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const bloom = restored ? 1 + (completion ? Math.sin(completion.progress * Math.PI) * 0.4 : 0) : 0.42;
      ctx.save();
      ctx.translate(x, y - 2);
      ctx.scale(bloom, bloom);
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal / 5 * Math.PI * 2;
        ctx.fillStyle = locked ? "#465448" : restored ? "#c5cfa2" : "#6c8b70";
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * 4, Math.sin(angle) * 4, 4, 2, angle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = locked ? "#667656" : "#c8d39a";
      ctx.beginPath();
      ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (restored) {
    // Three quiet flowers persist on the plinth, including mushroom shrines.
    // They never close the roots or cover an unclaimed interaction rune.
    for (const x of [-15, 0, 15]) {
      ctx.fillStyle = locked ? "#637367" : "#d3d4ae";
      for (let petal = 0; petal < 4; petal++) {
        const angle = petal * Math.PI / 2;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(angle) * 2.5, 28 + Math.sin(angle) * 1.8, 2.8, 1.2, angle, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = locked ? "#7e8565" : "#b1bc86";
      ctx.beginPath();
      ctx.arc(x, 28, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Foreground tendrils visibly seal the stone as the outer roots close.
  if (closure > 0.01) {
    ctx.save();
    ctx.globalAlpha *= closure;
    ctx.strokeStyle = completed ? "#756e52" : "#444935";
    ctx.lineWidth = completed ? 5 : 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 27, 23);
      ctx.bezierCurveTo(side * 24, 6, side * (23 - closure * 19), -6, side * (24 - closure * 32), -24);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(147,143,98,.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-26, 22);
    ctx.bezierCurveTo(-24, 6, -(23 - closure * 19), -6, -(24 - closure * 32), -24);
    ctx.stroke();
    ctx.restore();
  }

  if (completed) {
    // A pale crossed binding and wax-like moon seal remain after the short bloom.
    ctx.strokeStyle = locked ? "#a79d7c" : "#dfc996";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-22, -16);
    ctx.lineTo(18, 18);
    ctx.moveTo(22, -16);
    ctx.lineTo(-18, 18);
    ctx.stroke();
    ctx.fillStyle = locked ? "#a99b79" : "#e6d3a4";
    ctx.strokeStyle = "#5e655c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -1, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#445766";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -1);
    ctx.lineTo(-1, 2);
    ctx.lineTo(4, -4);
    ctx.stroke();
  }

  // Available shrines have a few slow fireflies; completed light is steady.
  if (!locked && !completed) {
    for (let i = 0; i < 4; i++) {
      const x = Math.sin(time * 0.55 + i * 2.1 + station.pulse) * 39;
      const y = -12 + Math.cos(time * 0.8 + i * 1.7) * 22;
      ctx.fillStyle = `rgba(197,221,149,${0.3 + Math.sin(time * 2 + i) * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (completion) {
    // This cue is strictly visual: it does not grant vision or affect players.
    ctx.strokeStyle = `rgba(191,235,190,${completion.alpha})`;
    ctx.lineWidth = 2 - completion.progress;
    ctx.beginPath();
    ctx.arc(0, 0, completion.radius, 0, Math.PI * 2);
    ctx.stroke();
    const bloom = ctx.createRadialGradient(0, 0, 3, 0, 0, completion.radius);
    bloom.addColorStop(0, `rgba(165,224,155,${completion.alpha * 0.16})`);
    bloom.addColorStop(1, "rgba(165,224,155,0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(-58, -58, 116, 116);
    ctx.fillStyle = `rgba(211,228,186,${completion.alpha * 0.72})`;
    for (let petal = 0; petal < 8; petal++) {
      const angle = petal * Math.PI / 4 + station.pulse;
      const radius = 22 + completion.progress * 12;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6, 3.8, 1.5, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (nearby && !completed && !locked) {
    // A small ground ring makes interaction range legible without adding vision.
    ctx.strokeStyle = "rgba(202,230,211,.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 24, 49, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw after actors, but before lighting and Rootwake masks: no hidden-cell leaks. */
export function drawSanctumStatus(ctx: CanvasRenderingContext2D, station: Sanctum, time: number, locked: boolean, nearby: boolean) {
  if (!station.completed && !nearby) return;
  const sealed = station.completed;
  const personalRite = station.teamRestored === true && !sealed;
  const label = sealed ? "SEALED" : locked ? "LOCKED" : personalRite ? "GEAR READY" : "TASK READY";
  const width = sealed ? 85 : locked ? 85 : 111;
  // The top-left ward meter overlays the upper arena. Put north-shrine
  // badges on the approach side so the HUD cannot hide a completed state.
  const northShrine = station.y < 160;
  const y = northShrine ? 58 : -67;
  ctx.save();
  ctx.translate(station.x, station.y);
  ctx.lineCap = "round";
  // A tether keeps this floating status attached to its shrine.
  ctx.strokeStyle = sealed ? "rgba(235,216,171,.58)" : "rgba(176,205,201,.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, northShrine ? y - 12 : y + 12);
  ctx.lineTo(0, northShrine ? 30 : -48);
  ctx.stroke();
  ctx.fillStyle = sealed ? "#e8d9b6" : locked ? "#34434e" : "#233f46";
  ctx.strokeStyle = sealed ? "#697888" : locked ? "#7f9197" : "#acd4c5";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-width / 2 + 8, y - 12);
  ctx.lineTo(width / 2 - 8, y - 12);
  ctx.quadraticCurveTo(width / 2, y - 12, width / 2, y - 4);
  ctx.lineTo(width / 2, y + 4);
  ctx.quadraticCurveTo(width / 2, y + 12, width / 2 - 8, y + 12);
  ctx.lineTo(-width / 2 + 8, y + 12);
  ctx.quadraticCurveTo(-width / 2, y + 12, -width / 2, y + 4);
  ctx.lineTo(-width / 2, y - 4);
  ctx.quadraticCurveTo(-width / 2, y - 12, -width / 2 + 8, y - 12);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = sealed ? "#405568" : locked ? "#b3c0c3" : "#d1ebd7";
  ctx.lineWidth = 2;
  const iconX = -width / 2 + 14;
  ctx.beginPath();
  if (sealed) {
    ctx.moveTo(iconX - 4, y);
    ctx.lineTo(iconX - 1, y + 3);
    ctx.lineTo(iconX + 5, y - 4);
  } else if (locked) {
    ctx.arc(iconX, y - 2, 3.5, Math.PI, Math.PI * 2);
    ctx.moveTo(iconX - 4, y - 1);
    ctx.lineTo(iconX + 4, y - 1);
    ctx.lineTo(iconX + 4, y + 5);
    ctx.lineTo(iconX - 4, y + 5);
    ctx.closePath();
  } else {
    const pulse = 1 + Math.sin(time * 2.3 + station.pulse) * 0.15;
    ctx.moveTo(iconX, y - 5 * pulse);
    ctx.lineTo(iconX + 4 * pulse, y);
    ctx.lineTo(iconX, y + 5 * pulse);
    ctx.lineTo(iconX - 4 * pulse, y);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.fillStyle = sealed ? "#34495c" : locked ? "#b3c0c3" : "#d7eee1";
  ctx.textAlign = "center";
  ctx.font = "800 11px ui-monospace, monospace";
  ctx.fillText(label, 8, y + 3.5);
  if (nearby) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10,20,29,.95)";
    ctx.font = "700 10px ui-monospace, monospace";
    const nameY = northShrine ? y + 29 : -88;
    ctx.strokeText(station.label, 0, nameY);
    ctx.fillStyle = "#e2e9e4";
    ctx.fillText(station.label, 0, nameY);
    const hint = sealed ? "REOPENS NEXT CALM" : locked ? "SHRINE RESTING" : personalRite ? "E · PERSONAL RITE" : "E · INTERACT";
    ctx.font = "700 8px ui-monospace, monospace";
    const hintY = northShrine ? y + 42 : 48;
    ctx.strokeText(hint, 0, hintY);
    ctx.fillStyle = sealed ? "#eee0bc" : locked ? "#abb9b9" : "#d1e6d6";
    ctx.fillText(hint, 0, hintY);
  }
  ctx.restore();
}
