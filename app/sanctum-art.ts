export const SANCTUM_PULSE_SECONDS = 0.5;

export function sanctumPulse(now: number, completedAt?: number) {
  if (completedAt === undefined) return null;
  const age = now - completedAt;
  if (age < 0 || age >= SANCTUM_PULSE_SECONDS) return null;
  const progress = age / SANCTUM_PULSE_SECONDS;
  return { progress, radius: 16 + progress * 42, alpha: (1 - progress) * 0.8 };
}

type Sanctum = {
  x: number;
  y: number;
  pulse: number;
  completed: boolean;
  completedAt?: number;
  rootClosure?: number;
  label: string;
  reward: "FLASHLIGHT" | "FLARE" | "SONAR";
};

/** Forest matter, carved moonstone, and local light; no screen-shaped station panels. */
export function drawForestSanctum(ctx: CanvasRenderingContext2D, station: Sanctum, time: number, locked: boolean, nearby: boolean) {
  const { completed } = station;
  const closure = station.rootClosure ?? Number(locked);
  const breath = completed ? 0.7 : 0.48 + Math.sin(time * 2.3 + station.pulse) * 0.15;
  const brightness = locked ? 0.16 : breath;
  const completion = sanctumPulse(time, station.completedAt);
  ctx.save();
  ctx.translate(station.x, station.y);

  ctx.fillStyle = "rgba(2,10,14,.42)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 50, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  const halo = ctx.createRadialGradient(0, 1, 4, 0, 1, 54);
  halo.addColorStop(0, `rgba(137,201,168,${brightness * 0.25})`);
  halo.addColorStop(1, "rgba(85,152,119,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(-56, -55, 112, 112);

  // An irregular moss bed and small stones anchor the shrine in the ground.
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4 + station.pulse;
    const x = Math.cos(angle) * (28 + (i % 3) * 5);
    const y = 14 + Math.sin(angle) * 15;
    const stone = ctx.createLinearGradient(x, y - 6, x + 6, y + 7);
    stone.addColorStop(0, i % 2 ? "#536457" : "#65716a");
    stone.addColorStop(1, "#26372e");
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
      ctx.fillStyle = locked ? "#293c2d" : completed ? "#5c7951" : "#3d5c3d";
      ctx.beginPath();
      ctx.ellipse(x, y - 3, 7, 2.6, side * -0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const rock = ctx.createLinearGradient(-16, -26, 21, 24);
  rock.addColorStop(0, "#82918a");
  rock.addColorStop(0.4, "#485e55");
  rock.addColorStop(1, "#24392f");
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
  ctx.strokeStyle = `rgba(183,222,192,${brightness})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -3, 12, -Math.PI * 0.7, Math.PI * (completed ? 1.3 : 0.7));
  ctx.moveTo(-7, 2);
  ctx.lineTo(0, -13);
  ctx.lineTo(7, 2);
  ctx.lineTo(completed ? -7 : 1, 2);
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
      const bloom = completed ? 1 + (completion ? Math.sin(completion.progress * Math.PI) * 0.4 : 0) : 0.42;
      ctx.save();
      ctx.translate(x, y - 2);
      ctx.scale(bloom, bloom);
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal / 5 * Math.PI * 2;
        ctx.fillStyle = locked ? "#465448" : completed ? "#c5cfa2" : "#6c8b70";
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

  // Foreground tendrils visibly seal the stone as the outer roots close.
  if (closure > 0.01) {
    ctx.save();
    ctx.globalAlpha *= closure;
    ctx.strokeStyle = "#444935";
    ctx.lineWidth = 4;
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

  if (nearby) {
    const status = locked ? "ORDEAL LOCKED" : completed ? "WARD SEALED · NEXT ROUND" : "E · INTERACT";
    ctx.textAlign = "center";
    ctx.font = "700 10px ui-monospace, monospace";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(4,15,12,.9)";
    ctx.strokeText(station.label, 0, -44);
    ctx.fillStyle = "#d4e3d2";
    ctx.fillText(station.label, 0, -44);
    ctx.font = "700 8px ui-monospace, monospace";
    ctx.strokeText(status, 0, 44);
    ctx.fillStyle = locked ? "#89998d" : completed ? "#bbd9ad" : "#9cbfa8";
    ctx.fillText(status, 0, 44);
  }
  ctx.restore();
}
