"use client";

import { useEffect, useRef, useState } from "react";

type Role = "CREWMATE" | "IMPOSTOR";
type RoleChoice = Role | "RANDOM";
type Phase = "CALM" | "COUNTDOWN" | "ORDEAL" | "DISCUSSION";
type Hazard = "BLACKOUT" | "FOG";
type ItemKind = "FLASHLIGHT" | "FLARE" | "SONAR";
type Hat = "sailor" | "captain" | "goggles" | "headset";

type Player = {
  id: string;
  name: string;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  hat: Hat;
  alive: boolean;
  ai: boolean;
  targetX: number;
  targetY: number;
  thinkAt: number;
  atStation: number;
  flashlight: boolean;
  flareDropped: boolean;
};

type Station = {
  x: number;
  y: number;
  side: "top" | "right" | "bottom" | "left";
  label: string;
  pulse: number;
  cooldown: number;
};

type Body = { id: string; x: number; y: number; color: string; name: string; age: number };
type Flare = { x: number; y: number; life: number; owner: string };

type Snapshot = {
  phase: Phase;
  time: number;
  hazard: Hazard;
  taskProgress: number;
  selectedItem: ItemKind;
  charges: Record<ItemKind, number>;
  role: Role;
  living: number;
  total: number;
  canKill: boolean;
  canReport: boolean;
  taskPrompt: boolean;
  humanAlive: boolean;
  message: string;
};

type Meeting = { reason: string; reporter: string; candidates: Player[] };

const W = 1280;
const H = 760;
const ROOM = { left: 76, top: 72, right: 1204, bottom: 690 };
const COLORS = ["#20d8ed", "#95ef45", "#ff5d9e", "#ffd94a", "#a879ff", "#ff9843", "#5ea7ff", "#48e0a4"];
const NAMES = ["Bubbles", "Mochi", "Gloop", "Pebble", "Nori", "Fizz", "Wobble", "Pip"];
const HATS: Hat[] = ["sailor", "captain", "goggles", "headset"];
const ITEM_LABELS: Record<ItemKind, string> = { FLASHLIGHT: "Flashlight", FLARE: "Signal Flare", SONAR: "Sonar" };

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const choose = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function initialSnapshot(role: Role = "CREWMATE"): Snapshot {
  return {
    phase: "CALM",
    time: 15,
    hazard: "BLACKOUT",
    taskProgress: 0,
    selectedItem: "FLASHLIGHT",
    charges: { FLASHLIGHT: 1, FLARE: 1, SONAR: 1 },
    role,
    living: 0,
    total: 0,
    canKill: false,
    canReport: false,
    taskPrompt: false,
    humanAlive: true,
    message: "",
  };
}

class OrdealEngine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mask: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
  players: Player[] = [];
  stations: Station[] = [];
  bodies: Body[] = [];
  flares: Flare[] = [];
  keys = new Set<string>();
  touchKeys = new Set<string>();
  mouse = { x: W * 0.72, y: H * 0.45 };
  phase: Phase = "CALM";
  phaseTime = 15;
  hazard: Hazard = "BLACKOUT";
  taskProgress = 0;
  selectedItem: ItemKind = "FLASHLIGHT";
  charges: Record<ItemKind, number> = { FLASHLIGHT: 1, FLARE: 1, SONAR: 1 };
  itemActiveUntil = 0;
  taskHold = 0;
  killUsed = false;
  frame = 0;
  last = 0;
  elapsed = 0;
  emitAt = 0;
  running = true;
  paused = false;
  message = "Walk to a perimeter console and hold E to calibrate.";
  messageUntil = 4;
  onSnapshot: (snapshot: Snapshot) => void;
  onMeeting: (meeting: Meeting | null) => void;
  onEnd: (result: string) => void;

  constructor(
    canvas: HTMLCanvasElement,
    count: number,
    roleChoice: RoleChoice,
    onSnapshot: (snapshot: Snapshot) => void,
    onMeeting: (meeting: Meeting | null) => void,
    onEnd: (result: string) => void,
  ) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not supported in this browser.");
    this.ctx = context;
    this.mask = document.createElement("canvas");
    this.mask.width = W;
    this.mask.height = H;
    const maskContext = this.mask.getContext("2d");
    if (!maskContext) throw new Error("Offscreen canvas is not supported.");
    this.maskCtx = maskContext;
    this.onSnapshot = onSnapshot;
    this.onMeeting = onMeeting;
    this.onEnd = onEnd;
    this.makeStations();
    this.makePlayers(count, roleChoice);
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("contextmenu", this.contextMenu);
    this.onSnapshot(this.snapshot());
    this.frame = requestAnimationFrame(this.loop);
  }

  get human() {
    return this.players[0];
  }

  makeStations() {
    this.stations = [
      { x: 250, y: 104, side: "top", label: "OXYGEN MIX", pulse: 0, cooldown: 0 },
      { x: 640, y: 104, side: "top", label: "STAR MAP", pulse: 1.2, cooldown: 0 },
      { x: 1038, y: 104, side: "top", label: "COMMS ARRAY", pulse: 2.4, cooldown: 0 },
      { x: 1164, y: 390, side: "right", label: "PRESSURE", pulse: 3.1, cooldown: 0 },
      { x: 844, y: 658, side: "bottom", label: "COOLANT", pulse: 4.2, cooldown: 0 },
      { x: 116, y: 402, side: "left", label: "POWER GRID", pulse: 5.1, cooldown: 0 },
    ];
  }

  makePlayers(count: number, roleChoice: RoleChoice) {
    let impostorIndex = Math.floor(Math.random() * count);
    if (roleChoice === "IMPOSTOR") impostorIndex = 0;
    if (roleChoice === "CREWMATE") impostorIndex = 1 + Math.floor(Math.random() * (count - 1));
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      this.players.push({
        id: i === 0 ? "you" : `bot-${i}`,
        name: i === 0 ? "YOU" : NAMES[i - 1],
        role: i === impostorIndex ? "IMPOSTOR" : "CREWMATE",
        x: 640 + Math.cos(angle) * 170,
        y: 384 + Math.sin(angle) * 116,
        vx: 0,
        vy: 0,
        color: COLORS[i % COLORS.length],
        hat: HATS[i % HATS.length],
        alive: true,
        ai: i !== 0,
        targetX: 640,
        targetY: 380,
        thinkAt: 0,
        atStation: i % this.stations.length,
        flashlight: false,
        flareDropped: false,
      });
    }
  }

  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
  };

  keyDown = (event: KeyboardEvent) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyE", "KeyF", "KeyR", "KeyQ", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    this.keys.add(event.code);
    if (event.repeat || this.paused) return;
    if (event.code === "KeyF") this.useItem();
    if (event.code === "KeyR") this.report();
    if (event.code === "KeyQ" || event.code === "Space") this.kill();
    if (event.code === "Digit1") this.selectItem("FLASHLIGHT");
    if (event.code === "Digit2") this.selectItem("FLARE");
    if (event.code === "Digit3") this.selectItem("SONAR");
  };

  keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  pointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * W;
    this.mouse.y = ((event.clientY - rect.top) / rect.height) * H;
  };

  contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    this.useItem();
  };

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("contextmenu", this.contextMenu);
  }

  setTouch(code: string, down: boolean) {
    if (down) this.touchKeys.add(code);
    else this.touchKeys.delete(code);
  }

  selectItem(item: ItemKind) {
    this.selectedItem = item;
    this.emit(true);
  }

  useItem() {
    if (this.phase !== "ORDEAL" || !this.human.alive || this.paused) {
      this.flashMessage("Survival gear only activates during an Ordeal.");
      return;
    }
    const isDummy = this.human.role === "IMPOSTOR";
    if (!isDummy && this.charges[this.selectedItem] <= 0) {
      this.flashMessage("No charge. Complete a console task to recharge.");
      return;
    }
    if (!isDummy) this.charges[this.selectedItem] -= 1;
    if (this.selectedItem === "FLARE") {
      this.flares.push({ x: this.human.x, y: this.human.y, life: 5, owner: "you" });
      this.flashMessage(isDummy ? "Dummy flare deployed." : "Signal flare deployed — light holds for 5 seconds.");
    } else {
      this.itemActiveUntil = this.elapsed + (this.selectedItem === "FLASHLIGHT" ? 7 : 6);
      this.flashMessage(this.selectedItem === "FLASHLIGHT" ? "Flashlight online. Aim with your cursor." : "Proximity sonar sweeping nearby movement.");
    }
    this.emit(true);
  }

  report() {
    if (!this.human.alive || this.paused) return;
    const nearby = this.bodies.find((body) => dist(this.human, body) < 96);
    const atEmergency = dist(this.human, { x: 640, y: 382 }) < 92 && this.phase === "CALM";
    if (nearby) this.startMeeting(`${nearby.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, "YOU");
    else if (atEmergency) this.startMeeting("EMERGENCY MEETING", "YOU");
    else this.flashMessage("No body nearby. Emergency button is available during Calm.");
  }

  kill() {
    if (this.human.role !== "IMPOSTOR" || this.phase !== "ORDEAL" || this.killUsed || !this.human.alive || this.paused) return;
    const victims = this.players.filter((player) => player.alive && player.role === "CREWMATE" && dist(player, this.human) < 84);
    const victim = victims.sort((a, b) => dist(a, this.human) - dist(b, this.human))[0];
    if (!victim) {
      this.flashMessage("No crewmate in melee range.");
      return;
    }
    this.eliminate(victim, this.human);
    this.killUsed = true;
    this.flashMessage("Kill spent for this Ordeal. Blend back into the dark.");
  }

  eliminate(victim: Player, killer: Player) {
    victim.alive = false;
    victim.vx = 0;
    victim.vy = 0;
    this.bodies.push({ id: victim.id, x: victim.x, y: victim.y, color: victim.color, name: victim.name, age: 0 });
    if (victim.id === "you") this.flashMessage("You were splattered. Spectating the remaining crew.");
    killer.targetX = ROOM.left + 130 + Math.random() * (ROOM.right - ROOM.left - 260);
    killer.targetY = ROOM.top + 120 + Math.random() * (ROOM.bottom - ROOM.top - 240);
    this.checkWin();
  }

  startMeeting(reason: string, reporter: string) {
    if (this.paused) return;
    this.paused = true;
    this.phase = "DISCUSSION";
    this.onMeeting({ reason, reporter, candidates: this.players.map((player) => ({ ...player })) });
    this.emit(true);
  }

  vote(targetId: string | null) {
    if (!this.paused) return;
    const tally = new Map<string, number>();
    const add = (id: string) => tally.set(id, (tally.get(id) || 0) + 1);
    add(targetId || "SKIP");
    const living = this.players.filter((player) => player.alive);
    for (const voter of living.filter((player) => player.ai)) {
      const options = living.filter((player) => player.id !== voter.id);
      let pick: Player | undefined;
      if (voter.role === "IMPOSTOR") {
        pick = choose(options.filter((player) => player.role !== "IMPOSTOR"));
      } else if (Math.random() < 0.36) {
        pick = living.find((player) => player.role === "IMPOSTOR" && player.id !== voter.id);
      } else if (Math.random() < 0.22) {
        add("SKIP");
        continue;
      } else {
        pick = choose(options);
      }
      if (pick) add(pick.id);
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
    const ejectedId = tied || ranked[0][0] === "SKIP" ? null : ranked[0][0];
    if (ejectedId) {
      const ejected = this.players.find((player) => player.id === ejectedId);
      if (ejected) {
        ejected.alive = false;
        this.flashMessage(`${ejected.name} was ejected. ${ejected.role === "IMPOSTOR" ? "They were the Impostor." : "They were Crew."}`);
      }
    } else {
      this.flashMessage(tied ? "Vote tied. No one was ejected." : "The crew skipped the vote.");
    }
    this.bodies = [];
    this.onMeeting(null);
    this.paused = false;
    if (!this.checkWin()) {
      this.phase = "CALM";
      this.phaseTime = 15;
      this.killUsed = false;
    }
    this.emit(true);
  }

  checkWin() {
    const impostor = this.players.find((player) => player.role === "IMPOSTOR");
    const crewLiving = this.players.filter((player) => player.role === "CREWMATE" && player.alive).length;
    if (!impostor?.alive) {
      this.end("CREW VICTORY — THE IMPOSTOR WAS EJECTED");
      return true;
    }
    if (this.taskProgress >= 100) {
      this.end("CREW VICTORY — ALL SYSTEMS RESTORED");
      return true;
    }
    if (crewLiving <= 1) {
      this.end("IMPOSTOR VICTORY — THE CREW IS AT PARITY");
      return true;
    }
    return false;
  }

  end(result: string) {
    this.paused = true;
    this.onEnd(result);
  }

  flashMessage(message: string) {
    this.message = message;
    this.messageUntil = this.elapsed + 3.5;
    this.emit(true);
  }

  snapshot(): Snapshot {
    const nearbyBody = this.bodies.some((body) => dist(body, this.human) < 96);
    const nearButton = this.phase === "CALM" && dist(this.human, { x: 640, y: 382 }) < 92;
    const nearestStation = this.stations.some((station) => dist(station, this.human) < 84 && station.cooldown <= 0);
    const victimNear = this.players.some((player) => player.alive && player.role === "CREWMATE" && dist(player, this.human) < 84);
    return {
      phase: this.phase,
      time: Math.max(0, this.phaseTime),
      hazard: this.hazard,
      taskProgress: this.taskProgress,
      selectedItem: this.selectedItem,
      charges: { ...this.charges },
      role: this.human.role,
      living: this.players.filter((player) => player.alive).length,
      total: this.players.length,
      canKill: this.human.role === "IMPOSTOR" && this.phase === "ORDEAL" && !this.killUsed && victimNear,
      canReport: nearbyBody || nearButton,
      taskPrompt: nearestStation && this.phase === "CALM" && this.human.alive,
      humanAlive: this.human.alive,
      message: this.elapsed < this.messageUntil ? this.message : "",
    };
  }

  emit(force = false) {
    if (!force && this.elapsed < this.emitAt) return;
    this.emitAt = this.elapsed + 0.12;
    this.onSnapshot(this.snapshot());
  }

  loop = (now: number) => {
    if (!this.running) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.035) : 0;
    this.last = now;
    this.elapsed += dt;
    if (!this.paused) this.update(dt);
    this.draw();
    this.emit();
    this.frame = requestAnimationFrame(this.loop);
  };

  update(dt: number) {
    this.phaseTime -= dt;
    if (this.phaseTime <= 0) {
      if (this.phase === "CALM") {
        this.phase = "COUNTDOWN";
        this.phaseTime = 3;
        this.flashMessage("ORDEAL INCOMING — remember who is nearby.");
      } else if (this.phase === "COUNTDOWN") {
        this.phase = "ORDEAL";
        this.phaseTime = 10;
        this.hazard = Math.random() > 0.5 ? "BLACKOUT" : "FOG";
        this.killUsed = false;
        for (const player of this.players) player.flareDropped = false;
        this.flashMessage(this.hazard === "BLACKOUT" ? "TOTAL BLACKOUT — light is survival." : "THICK SEA FOG — silhouettes cannot be trusted.");
      } else if (this.phase === "ORDEAL") {
        this.phase = "CALM";
        this.phaseTime = 15;
        this.itemActiveUntil = 0;
        this.flashMessage("Visibility restored. Find the missing. Finish the tasks.");
      }
    }

    for (const station of this.stations) station.cooldown = Math.max(0, station.cooldown - dt);
    for (const body of this.bodies) body.age += dt;
    this.flares = this.flares.filter((flare) => (flare.life -= dt) > 0);
    this.updateHuman(dt);
    this.updateBots(dt);
  }

  updateHuman(dt: number) {
    const player = this.human;
    if (!player.alive) return;
    const pressed = (code: string) => this.keys.has(code) || this.touchKeys.has(code);
    let dx = Number(pressed("KeyD") || pressed("ArrowRight")) - Number(pressed("KeyA") || pressed("ArrowLeft"));
    let dy = Number(pressed("KeyS") || pressed("ArrowDown")) - Number(pressed("KeyW") || pressed("ArrowUp"));
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const speed = 184;
    player.vx += (dx * speed - player.vx) * Math.min(1, dt * 12);
    player.vy += (dy * speed - player.vy) * Math.min(1, dt * 12);
    if (!dx) player.vx *= Math.pow(0.004, dt);
    if (!dy) player.vy *= Math.pow(0.004, dt);
    player.x = clamp(player.x + player.vx * dt, ROOM.left + 36, ROOM.right - 36);
    player.y = clamp(player.y + player.vy * dt, ROOM.top + 48, ROOM.bottom - 32);

    const station = this.stations.find((entry) => dist(entry, player) < 84 && entry.cooldown <= 0);
    if (station && pressed("KeyE") && this.phase === "CALM") {
      this.taskHold += dt;
      if (player.role === "CREWMATE") {
        this.taskProgress = Math.min(100, this.taskProgress + dt * 5.4);
        if (this.taskHold >= 1.8) {
          this.taskHold = 0;
          station.cooldown = 5;
          const item = this.selectedItem;
          this.charges[item] = Math.min(3, this.charges[item] + 1);
          this.flashMessage(`${ITEM_LABELS[item]} recharged. Shared systems advanced.`);
          if (this.checkWin()) return;
        }
      } else if (this.taskHold >= 1.8) {
        this.taskHold = 0;
        station.cooldown = 4;
        this.flashMessage("Fake calibration complete. Task bar unchanged.");
      }
    } else {
      this.taskHold = Math.max(0, this.taskHold - dt * 1.4);
    }
  }

  updateBots(dt: number) {
    for (const player of this.players) {
      if (!player.ai || !player.alive) continue;
      const discoveredBody = this.bodies.find((body) => dist(player, body) < 72);
      if (discoveredBody && Math.random() < dt * (player.role === "IMPOSTOR" ? 0.18 : 0.7)) {
        this.startMeeting(`${discoveredBody.name.toUpperCase()} WAS FOUND AS A JELLY PUDDLE`, player.name.toUpperCase());
        return;
      }
      if (this.elapsed > player.thinkAt || dist(player, { x: player.targetX, y: player.targetY }) < 22) {
        player.thinkAt = this.elapsed + 1.2 + Math.random() * 2.2;
        if (this.phase === "CALM" || this.phase === "COUNTDOWN") {
          const station = this.stations[player.atStation % this.stations.length];
          player.targetX = station.x + (Math.random() - 0.5) * 28;
          player.targetY = station.y + (station.side === "top" ? 66 : station.side === "bottom" ? -62 : 0) + (Math.random() - 0.5) * 24;
          if (station.side === "left") player.targetX += 66;
          if (station.side === "right") player.targetX -= 66;
        } else if (player.role === "IMPOSTOR" && !this.killUsed) {
          const victims = this.players.filter((entry) => entry.alive && entry.role === "CREWMATE");
          const victim = victims.sort((a, b) => dist(a, player) - dist(b, player))[0];
          if (victim) {
            player.targetX = victim.x;
            player.targetY = victim.y;
          }
        } else {
          player.targetX = ROOM.left + 100 + Math.random() * (ROOM.right - ROOM.left - 200);
          player.targetY = ROOM.top + 90 + Math.random() * (ROOM.bottom - ROOM.top - 150);
        }
      }

      const dx = player.targetX - player.x;
      const dy = player.targetY - player.y;
      const length = Math.hypot(dx, dy) || 1;
      const speed = player.role === "IMPOSTOR" && this.phase === "ORDEAL" ? 148 : 122;
      player.vx += ((dx / length) * speed - player.vx) * Math.min(1, dt * 5);
      player.vy += ((dy / length) * speed - player.vy) * Math.min(1, dt * 5);
      player.x = clamp(player.x + player.vx * dt, ROOM.left + 36, ROOM.right - 36);
      player.y = clamp(player.y + player.vy * dt, ROOM.top + 48, ROOM.bottom - 32);

      if (this.phase === "CALM" && player.role === "CREWMATE") {
        const station = this.stations[player.atStation % this.stations.length];
        if (dist(player, station) < 78 && station.cooldown <= 0) {
          this.taskProgress = Math.min(100, this.taskProgress + dt * 0.34);
          if (Math.random() < dt * 0.2) {
            station.cooldown = 3;
            player.atStation = (player.atStation + 1 + Math.floor(Math.random() * 3)) % this.stations.length;
          }
        }
      }

      if (this.phase === "ORDEAL") {
        if (Math.random() < dt * 0.12) player.flashlight = !player.flashlight;
        if (!player.flareDropped && player.role === "CREWMATE" && Math.random() < dt * 0.055) {
          this.flares.push({ x: player.x, y: player.y, life: 5, owner: player.id });
          player.flareDropped = true;
        }
        if (player.role === "IMPOSTOR" && !this.killUsed && this.phaseTime < 8.4) {
          const victim = this.players
            .filter((entry) => entry.alive && entry.role === "CREWMATE")
            .sort((a, b) => dist(a, player) - dist(b, player))[0];
          if (victim && dist(victim, player) < 66) {
            this.eliminate(victim, player);
            this.killUsed = true;
          }
        }
      } else {
        player.flashlight = false;
      }
    }
    this.checkWin();
  }

  draw() {
    const dpr = this.canvas.width / W;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.drawRoom(ctx);
    this.drawBeams(ctx);
    for (const body of this.bodies) this.drawBody(ctx, body);
    const ordered = [...this.players].filter((player) => player.alive).sort((a, b) => a.y - b.y);
    for (const player of ordered) {
      const silhouette = this.phase === "ORDEAL" && this.hazard === "FOG" && this.human.role === "CREWMATE" && player.id !== "you" && !this.isRevealed(player);
      this.drawSlime(ctx, player, silhouette);
    }
    this.drawLighting(ctx);
    this.drawParticles(ctx);
    this.drawCanvasLabels(ctx);
  }

  drawRoom(ctx: CanvasRenderingContext2D) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#101b27");
    bg.addColorStop(1, "#071019");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 28;
    ctx.fillStyle = "#273747";
    ctx.strokeStyle = "#05090d";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.roundRect(ROOM.left, ROOM.top, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top, 34);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const deck = ctx.createLinearGradient(0, ROOM.top, 0, ROOM.bottom);
    deck.addColorStop(0, "#3b5062");
    deck.addColorStop(0.5, "#2c3f50");
    deck.addColorStop(1, "#213340");
    ctx.fillStyle = deck;
    ctx.beginPath();
    ctx.roundRect(ROOM.left + 18, ROOM.top + 18, ROOM.right - ROOM.left - 36, ROOM.bottom - ROOM.top - 36, 20);
    ctx.fill();

    ctx.strokeStyle = "rgba(111,145,164,.2)";
    ctx.lineWidth = 2;
    for (let x = ROOM.left + 34; x < ROOM.right; x += 188) {
      ctx.beginPath();
      ctx.moveTo(x, ROOM.top + 20);
      ctx.lineTo(x + 34, ROOM.bottom - 20);
      ctx.stroke();
    }
    for (let y = ROOM.top + 105; y < ROOM.bottom; y += 112) {
      ctx.beginPath();
      ctx.moveTo(ROOM.left + 18, y);
      ctx.lineTo(ROOM.right - 18, y);
      ctx.stroke();
    }
    for (let x = ROOM.left + 46; x < ROOM.right - 20; x += 134) {
      for (let y = ROOM.top + 48; y < ROOM.bottom - 20; y += 112) {
        ctx.fillStyle = "rgba(7,15,22,.6)";
        ctx.beginPath();
        ctx.arc(x + ((Math.floor(y) / 112) % 2) * 24, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(164,194,207,.35)";
        ctx.beginPath();
        ctx.arc(x - 1 + ((Math.floor(y) / 112) % 2) * 24, y - 1, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.drawHazardStrip(ctx, ROOM.left + 22, ROOM.top + 20, ROOM.right - ROOM.left - 44, 15);
    this.drawHazardStrip(ctx, ROOM.left + 22, ROOM.bottom - 35, ROOM.right - ROOM.left - 44, 15);

    ctx.strokeStyle = "#14222d";
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(92, 178);
    ctx.lineTo(92, 592);
    ctx.stroke();
    ctx.strokeStyle = "#4b6572";
    ctx.lineWidth = 8;
    ctx.stroke();
    for (let y = 196; y < 590; y += 84) {
      ctx.fillStyle = "#17242d";
      ctx.fillRect(78, y, 28, 11);
      ctx.fillStyle = "#6f8790";
      ctx.fillRect(82, y + 2, 20, 3);
    }

    for (const station of this.stations) this.drawStation(ctx, station);
    this.drawEmergency(ctx);

    ctx.font = "800 13px ui-monospace, monospace";
    ctx.fillStyle = "rgba(176,210,221,.5)";
    ctx.textAlign = "center";
    ctx.fillText("SS ACHERON  •  ORDEAL DECK 07", W / 2, ROOM.bottom - 50);
  }

  drawHazardStrip(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.fillStyle = "#d6a825";
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "#172027";
    ctx.lineWidth = 12;
    for (let i = x - 30; i < x + width + 30; i += 34) {
      ctx.beginPath();
      ctx.moveTo(i, y + height + 6);
      ctx.lineTo(i + 22, y - 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStation(ctx: CanvasRenderingContext2D, station: Station) {
    const vertical = station.side === "left" || station.side === "right";
    const w = vertical ? 64 : 132;
    const h = vertical ? 130 : 64;
    const x = station.x - w / 2;
    const y = station.y - h / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.7)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#17242e";
    ctx.strokeStyle = "#0a1118";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    const glow = station.cooldown > 0 ? "#66808b" : Math.sin(this.elapsed * 4 + station.pulse) > -0.2 ? "#50f0c2" : "#ffcc3d";
    ctx.fillStyle = "#0b1219";
    ctx.beginPath();
    ctx.roundRect(x + 10, y + 10, w - 20, h - 28, 6);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 14;
    if (vertical) ctx.fillRect(x + 22, y + 18, w - 44, h - 50);
    else ctx.fillRect(x + 18, y + 18, w - 36, h - 44);
    ctx.shadowBlur = 0;
    ctx.font = "800 9px ui-monospace, monospace";
    ctx.fillStyle = "#cfe4e8";
    ctx.textAlign = "center";
    if (vertical) {
      ctx.save();
      ctx.translate(station.x, station.y + 28);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(station.label, 0, 0);
      ctx.restore();
    } else ctx.fillText(station.label, station.x, y + h - 8);
    ctx.restore();
  }

  drawEmergency(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(640, 382);
    ctx.fillStyle = "rgba(7,15,22,.45)";
    ctx.beginPath();
    ctx.ellipse(0, 34, 110, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#182733";
    ctx.strokeStyle = "#091017";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(-84, -42, 168, 86, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#812c35";
    ctx.beginPath();
    ctx.ellipse(0, -8, 37, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff5260";
    ctx.shadowColor = "#ff5260";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(0, -14, 29, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = "900 10px ui-monospace, monospace";
    ctx.fillStyle = "#dbe9ec";
    ctx.textAlign = "center";
    ctx.fillText("EMERGENCY", 0, 30);
    ctx.restore();
  }

  drawBeams(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "ORDEAL") return;
    for (const player of this.players.filter((entry) => entry.alive)) {
      const humanActive = player.id === "you" && this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil;
      if (!player.flashlight && !humanActive) continue;
      const angle = player.id === "you" ? Math.atan2(this.mouse.y - player.y, this.mouse.x - player.x) : Math.atan2(player.vy, player.vx);
      const gradient = ctx.createRadialGradient(player.x, player.y, 15, player.x, player.y, 330);
      gradient.addColorStop(0, "rgba(255,244,181,.24)");
      gradient.addColorStop(1, "rgba(255,244,181,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.arc(player.x, player.y, 330, angle - Math.PI / 8, angle + Math.PI / 8);
      ctx.closePath();
      ctx.fill();
    }
    for (const flare of this.flares) {
      const radius = 142 * Math.min(1, flare.life * 2);
      const gradient = ctx.createRadialGradient(flare.x, flare.y, 5, flare.x, flare.y, radius);
      gradient.addColorStop(0, "rgba(255,92,73,.55)");
      gradient.addColorStop(0.45, "rgba(255,154,74,.2)");
      gradient.addColorStop(1, "rgba(255,92,73,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff2ac";
      ctx.shadowColor = "#ff523d";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, 6 + Math.sin(this.elapsed * 20) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  bodyPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, lean = 0) {
    ctx.beginPath();
    ctx.moveTo(x - width * 0.5, y + height * 0.35);
    ctx.bezierCurveTo(x - width * 0.62, y - height * 0.08, x - width * 0.34 + lean, y - height * 0.55, x + lean, y - height * 0.56);
    ctx.bezierCurveTo(x + width * 0.36 + lean, y - height * 0.55, x + width * 0.58, y - height * 0.08, x + width * 0.5, y + height * 0.34);
    ctx.bezierCurveTo(x + width * 0.38, y + height * 0.52, x + width * 0.22, y + height * 0.42, x + width * 0.1, y + height * 0.36);
    ctx.bezierCurveTo(x, y + height * 0.56, x - width * 0.22, y + height * 0.48, x - width * 0.3, y + height * 0.36);
    ctx.bezierCurveTo(x - width * 0.36, y + height * 0.48, x - width * 0.48, y + height * 0.45, x - width * 0.5, y + height * 0.35);
    ctx.closePath();
  }

  drawSlime(ctx: CanvasRenderingContext2D, player: Player, silhouette = false) {
    const speed = Math.hypot(player.vx, player.vy);
    const bounce = Math.sin(this.elapsed * 8 + Number(player.id.replace(/\D/g, "")) * 0.7) * Math.min(3, speed / 38);
    const squash = 1 + Math.min(0.14, speed / 900);
    const width = 58 * squash;
    const height = 70 / squash;
    const lean = clamp(player.vx / 32, -7, 7);
    const x = player.x;
    const y = player.y + bounce;

    ctx.save();
    ctx.fillStyle = "rgba(2,7,12,.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + 34, 39, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    if (speed > 55) {
      ctx.fillStyle = silhouette ? "rgba(132,144,151,.7)" : player.color;
      ctx.globalAlpha = 0.58;
      ctx.beginPath();
      ctx.arc(x - clamp(player.vx / speed, -1, 1) * 36, y + 24 - clamp(player.vy / speed, -1, 1) * 14, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.bodyPath(ctx, x, y, width, height, lean);
    const gradient = ctx.createLinearGradient(x - 25, y - 38, x + 28, y + 38);
    if (silhouette) {
      gradient.addColorStop(0, "rgba(191,205,211,.9)");
      gradient.addColorStop(1, "rgba(89,103,112,.9)");
    } else {
      gradient.addColorStop(0, `${player.color}f2`);
      gradient.addColorStop(1, `${player.color}a6`);
    }
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.fill();
    ctx.stroke();

    ctx.save();
    this.bodyPath(ctx, x, y, width - 8, height - 8, lean);
    ctx.clip();
    ctx.globalAlpha = silhouette ? 0.14 : 0.22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x - 16, y + 9, 6, 0, Math.PI * 2);
    ctx.arc(x + 19, y + 18, 4, 0, Math.PI * 2);
    ctx.arc(x + 11, y - 21, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = silhouette ? 0.18 : 0.7;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 21, y - 20);
    ctx.quadraticCurveTo(x - 12, y - 36, x + 5, y - 34);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(x - 11 + lean * 0.25, y - 5, 4.4, 0, Math.PI * 2);
    ctx.arc(x + 12 + lean * 0.25, y - 5, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x + lean * 0.2, y + 4, 7, 0.12, Math.PI - 0.12);
    ctx.stroke();

    this.drawHat(ctx, player.hat, x + lean * 0.6, y - 43, silhouette);
    ctx.font = "900 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(5,10,15,.92)";
    const privateRed = player.id === "you" && this.human.role === "IMPOSTOR";
    const label = silhouette ? "???" : player.name;
    ctx.strokeText(label, x, y - 61);
    ctx.fillStyle = privateRed ? "#ff5362" : silhouette ? "#d4dde0" : "#ffffff";
    ctx.fillText(label, x, y - 61);
    ctx.restore();
  }

  drawHat(ctx: CanvasRenderingContext2D, hat: Hat, x: number, y: number, muted: boolean) {
    ctx.save();
    const pale = muted ? "#9ca9ae" : "#eaf8f7";
    const navy = muted ? "#69767d" : "#183451";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    if (hat === "sailor") {
      ctx.fillStyle = pale;
      ctx.beginPath();
      ctx.moveTo(x - 22, y + 8);
      ctx.quadraticCurveTo(x, y - 11, x + 22, y + 8);
      ctx.lineTo(x + 18, y + 16);
      ctx.lineTo(x - 18, y + 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = navy;
      ctx.fillRect(x - 22, y + 8, 44, 8);
    } else if (hat === "captain") {
      ctx.fillStyle = pale;
      ctx.beginPath();
      ctx.roundRect(x - 22, y - 4, 44, 20, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = navy;
      ctx.fillRect(x - 24, y + 9, 48, 8);
      ctx.fillStyle = muted ? "#a9b1a1" : "#ffd84c";
      ctx.beginPath();
      ctx.arc(x, y + 5, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (hat === "goggles") {
      ctx.strokeStyle = navy;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x - 28, y + 9);
      ctx.lineTo(x + 28, y + 9);
      ctx.stroke();
      ctx.fillStyle = muted ? "#a8b4b6" : "#77eaff";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 4;
      for (const offset of [-12, 12]) {
        ctx.beginPath();
        ctx.arc(x + offset, y + 8, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = navy;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y + 10, 25, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = muted ? "#87949a" : "#ff6577";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - 29, y + 5, 10, 22, 4);
      ctx.roundRect(x + 19, y + 5, 10, 22, 4);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBody(ctx: CanvasRenderingContext2D, body: Body) {
    const wobble = Math.sin(this.elapsed * 3 + body.age) * 2;
    ctx.save();
    ctx.translate(body.x, body.y + 28);
    ctx.fillStyle = `${body.color}a8`;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-45, 5);
    ctx.bezierCurveTo(-38, -18, -12, -15 - wobble, -2, -9);
    ctx.bezierCurveTo(9, -26, 34, -15, 43, 2);
    ctx.bezierCurveTo(56, 14, 22, 22, 7, 15);
    ctx.bezierCurveTo(-9, 26, -47, 20, -45, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.ellipse(-14, -8, 12, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2f7e8";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-5, -28, 12, 33, 5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  isRevealed(player: Player) {
    if (dist(player, this.human) < 92) return true;
    if (this.flares.some((flare) => dist(player, flare) < 146)) return true;
    if (this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil) {
      const aim = Math.atan2(this.mouse.y - this.human.y, this.mouse.x - this.human.x);
      const target = Math.atan2(player.y - this.human.y, player.x - this.human.x);
      const delta = Math.atan2(Math.sin(target - aim), Math.cos(target - aim));
      if (Math.abs(delta) < Math.PI / 8 && dist(player, this.human) < 330) return true;
    }
    return false;
  }

  cutRadial(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    const glow = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    glow.addColorStop(0, "rgba(0,0,0,1)");
    glow.addColorStop(0.62, "rgba(0,0,0,.98)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLighting(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "ORDEAL") return;
    const mask = this.maskCtx;
    mask.clearRect(0, 0, W, H);
    mask.globalCompositeOperation = "source-over";
    mask.fillStyle = this.human.role === "IMPOSTOR" ? "rgba(5,9,17,.25)" : this.hazard === "BLACKOUT" ? "rgba(1,4,10,.965)" : "rgba(185,207,211,.76)";
    mask.fillRect(0, 0, W, H);
    if (this.human.role === "CREWMATE") {
      mask.globalCompositeOperation = "destination-out";
      this.cutRadial(mask, this.human.x, this.human.y, this.hazard === "BLACKOUT" ? 104 : 116);
      if (this.selectedItem === "FLASHLIGHT" && this.elapsed < this.itemActiveUntil) {
        const angle = Math.atan2(this.mouse.y - this.human.y, this.mouse.x - this.human.x);
        const cone = mask.createRadialGradient(this.human.x, this.human.y, 28, this.human.x, this.human.y, 360);
        cone.addColorStop(0, "rgba(0,0,0,1)");
        cone.addColorStop(0.72, "rgba(0,0,0,.9)");
        cone.addColorStop(1, "rgba(0,0,0,0)");
        mask.fillStyle = cone;
        mask.beginPath();
        mask.moveTo(this.human.x, this.human.y);
        mask.arc(this.human.x, this.human.y, 360, angle - Math.PI / 8, angle + Math.PI / 8);
        mask.closePath();
        mask.fill();
      }
      for (const flare of this.flares) this.cutRadial(mask, flare.x, flare.y, 152);
      if (this.selectedItem === "SONAR" && this.elapsed < this.itemActiveUntil) {
        const ring = ((this.elapsed * 110) % 190) + 30;
        mask.strokeStyle = "rgba(0,0,0,.9)";
        mask.lineWidth = 22;
        mask.beginPath();
        mask.arc(this.human.x, this.human.y, ring, 0, Math.PI * 2);
        mask.stroke();
      }
    }
    mask.globalCompositeOperation = "source-over";
    ctx.drawImage(this.mask, 0, 0);
  }

  drawParticles(ctx: CanvasRenderingContext2D) {
    if (this.phase !== "ORDEAL" || this.hazard !== "FOG") return;
    ctx.save();
    ctx.globalAlpha = this.human.role === "IMPOSTOR" ? 0.12 : 0.34;
    ctx.fillStyle = "#d7eaeb";
    for (let i = 0; i < 18; i += 1) {
      const x = ((i * 137 + this.elapsed * (12 + (i % 4) * 5)) % (W + 180)) - 90;
      const y = 90 + ((i * 73) % 570);
      ctx.beginPath();
      ctx.ellipse(x, y, 58 + (i % 3) * 25, 9 + (i % 4) * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCanvasLabels(ctx: CanvasRenderingContext2D) {
    if (this.phase === "COUNTDOWN") {
      const alpha = 0.62 + Math.sin(this.elapsed * 12) * 0.2;
      ctx.fillStyle = `rgba(166,18,30,${alpha})`;
      ctx.fillRect(0, 330, W, 94);
      ctx.strokeStyle = "#ff6670";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 330, W, 94);
      ctx.fillStyle = "#fff";
      ctx.font = "1000 34px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("⚠  ORDEAL COUNTDOWN", W / 2, 369);
      ctx.font = "800 17px ui-monospace, monospace";
      ctx.fillStyle = "#ffd9d9";
      ctx.fillText(`${Math.ceil(this.phaseTime)}  •  MEMORIZE WHO IS NEARBY`, W / 2, 399);
    }
    if (this.phase === "ORDEAL") {
      ctx.fillStyle = this.hazard === "BLACKOUT" ? "rgba(242,205,66,.9)" : "rgba(181,244,233,.9)";
      ctx.font = "900 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(this.hazard === "BLACKOUT" ? "TOTAL BLACKOUT ACTIVE" : "THICK SEA FOG ACTIVE", W / 2, 53);
    }
  }
}

function Logo() {
  return (
    <div className="brand" aria-label="Ordeal Deck">
      <span className="brand-mark"><i /><i /><i /></span>
      <span>ORDEAL <b>DECK</b></span>
    </div>
  );
}

function Lobby({ onLaunch }: { onLaunch: (count: number, role: RoleChoice) => void }) {
  const [players, setPlayers] = useState(6);
  const [role, setRole] = useState<RoleChoice>("RANDOM");
  return (
    <main className="lobby-shell">
      <header className="lobby-nav">
        <Logo />
        <div className="nav-status"><span /> LOCAL SHIP SIMULATION</div>
      </header>

      <section className="lobby-grid">
        <div className="lobby-copy">
          <div className="eyebrow"><span>SS ACHERON</span><span>DECK 07</span></div>
          <h1>Trust the light.<br /><em>Question everyone.</em></h1>
          <p className="lede">A ten-second darkness. One hidden saboteur. Complete the ship’s systems before your crew becomes a collection of suspicious puddles.</p>
          <div className="phase-ribbon" aria-label="Match phases">
            <div><small>01</small><b>CALM</b><span>15 SEC</span></div>
            <i>→</i>
            <div className="warning-phase"><small>02</small><b>WARNING</b><span>3 SEC</span></div>
            <i>→</i>
            <div className="ordeal-phase"><small>03</small><b>ORDEAL</b><span>10 SEC</span></div>
          </div>
          <div className="crew-showcase" aria-hidden="true">
            {COLORS.slice(0, 5).map((color, index) => (
              <div className={`mini-slime mini-${index}`} style={{ "--slime": color } as React.CSSProperties} key={color}>
                <span className="mini-hat" /><span className="eye e1" /><span className="eye e2" /><span className="shine" />
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-console">
          <div className="console-head">
            <div><span className="status-dot" /> PRIVATE PLAYTEST</div>
            <span>BUILD 0.8.4</span>
          </div>
          <div className="console-body">
            <label className="field-label" htmlFor="player-count">CREW MANIFEST <span>{players} SLOTS</span></label>
            <input id="player-count" className="player-range" type="range" min="4" max="8" value={players} onChange={(event) => setPlayers(Number(event.target.value))} />
            <div className="range-labels"><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>

            <div className="field-label role-label">TEST IDENTITY <span>PRIVATE TO THIS CLIENT</span></div>
            <div className="role-switch" role="group" aria-label="Choose test role">
              {(["RANDOM", "CREWMATE", "IMPOSTOR"] as RoleChoice[]).map((value) => (
                <button key={value} className={role === value ? "active" : ""} onClick={() => setRole(value)}>{value === "RANDOM" ? "AUTO" : value}</button>
              ))}
            </div>
            <p className="role-note">Role information never leaves your private HUD. Every slime uses the same movement, face, and silhouette.</p>

            <button className="launch-button" onClick={() => onLaunch(players, role)}>
              <span>BOARD THE ACHERON</span><kbd>ENTER</kbd>
            </button>
            <div className="console-log">
              <span><i className="green" /> AI CREW LINKED</span>
              <span><i className="amber" /> HAZARDS ARMED</span>
              <span><i className="green" /> ZERO VISUAL TELLS</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="lobby-footer"><span>WASD / ARROWS TO MOVE</span><span>E TASK</span><span>F ITEM</span><span>R REPORT</span><span>Q / SPACE KILL</span></footer>
    </main>
  );
}

function ItemIcon({ item }: { item: ItemKind }) {
  if (item === "FLASHLIGHT") return <span className="icon-flashlight" />;
  if (item === "FLARE") return <span className="icon-flare" />;
  return <span className="icon-sonar"><i /><i /></span>;
}

function Game({ count, roleChoice, onExit }: { count: number; roleChoice: RoleChoice; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<OrdealEngine | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot());
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new OrdealEngine(canvasRef.current, count, roleChoice, setSnapshot, setMeeting, setResult);
    engineRef.current = engine;
    return () => engine.destroy();
  }, [count, roleChoice]);

  const phaseLabel = snapshot.phase === "ORDEAL" ? (snapshot.hazard === "BLACKOUT" ? "TOTAL BLACKOUT" : "THICK SEA FOG") : snapshot.phase;
  const touch = (code: string, down: boolean) => engineRef.current?.setTouch(code, down);
  const touchProps = (code: string) => ({
    onPointerDown: (event: React.PointerEvent) => { event.preventDefault(); touch(code, true); },
    onPointerUp: () => touch(code, false),
    onPointerCancel: () => touch(code, false),
    onPointerLeave: () => touch(code, false),
  });

  return (
    <main className="game-shell">
      <header className="game-nav">
        <Logo />
        <div className={`phase-chip phase-${snapshot.phase.toLowerCase()}`}><span />{phaseLabel}<b>{Math.ceil(snapshot.time).toString().padStart(2, "0")}</b></div>
        <button className="leave-button" onClick={onExit}>LEAVE SIM</button>
      </header>

      <section className="game-stage">
        <canvas ref={canvasRef} aria-label="Top-down view of the SS Acheron cabin" />

        <div className="task-hud">
          <div className="task-label"><span>SHIP SYSTEMS</span><b>{Math.floor(snapshot.taskProgress)}%</b></div>
          <div className="task-track"><i style={{ width: `${snapshot.taskProgress}%` }} /></div>
        </div>

        <div className="crew-count"><span className="crew-dot" />{snapshot.living}<small> / {snapshot.total} ALIVE</small></div>

        {snapshot.role === "IMPOSTOR" && (
          <div className="private-role"><small>PRIVATE ROLE</small><b>IMPOSTOR</b><span>Only you see this</span></div>
        )}

        {snapshot.message && <div className="toast-message">{snapshot.message}</div>}
        {!snapshot.humanAlive && <div className="spectator-chip">SPECTATING • YOU ARE JELLY</div>}

        <div className="item-dock">
          <div className="dock-title"><span>SURVIVAL GEAR</span><small>F / RIGHT CLICK</small></div>
          <div className="dock-items">
            {(["FLASHLIGHT", "FLARE", "SONAR"] as ItemKind[]).map((item, index) => (
              <button key={item} className={snapshot.selectedItem === item ? "selected" : ""} onClick={() => engineRef.current?.selectItem(item)} aria-label={`Select ${ITEM_LABELS[item]}`}>
                <kbd>{index + 1}</kbd><ItemIcon item={item} /><span>{ITEM_LABELS[item]}</span><b>{snapshot.role === "IMPOSTOR" ? "∞" : snapshot.charges[item]}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="action-dock">
          <button className={`action report ${snapshot.canReport ? "ready" : ""}`} onClick={() => engineRef.current?.report()}><kbd>R</kbd><span>REPORT</span></button>
          {snapshot.role === "IMPOSTOR" && <button className={`action kill ${snapshot.canKill ? "ready" : ""}`} onClick={() => engineRef.current?.kill()} disabled={snapshot.phase !== "ORDEAL"}><kbd>Q</kbd><span>KILL</span></button>}
          <button className="action use" onClick={() => engineRef.current?.useItem()}><kbd>F</kbd><span>USE</span></button>
        </div>

        {snapshot.taskPrompt && <div className="interaction-prompt"><kbd>E</kbd><span>{snapshot.role === "IMPOSTOR" ? "FAKE CALIBRATION" : "HOLD TO CALIBRATE"}</span></div>}

        <div className="touch-pad" aria-label="Touch movement controls">
          <button {...touchProps("ArrowUp")}>▲</button>
          <button {...touchProps("ArrowLeft")}>◀</button>
          <button {...touchProps("ArrowDown")}>▼</button>
          <button {...touchProps("ArrowRight")}>▶</button>
        </div>
      </section>

      <footer className="game-footer"><span>MOVE <kbd>WASD</kbd></span><span>AIM <kbd>MOUSE</kbd></span><span>TASK <kbd>HOLD E</kbd></span><span>REPORT <kbd>R</kbd></span><span className="latency"><i /> AI LINK 12ms</span></footer>

      {meeting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="meeting-title">
          <div className="meeting-card">
            <div className="meeting-alert"><span>!</span><div><small>SHIPWIDE ALERT</small><h2 id="meeting-title">{meeting.reason}</h2></div><b>DISCUSS + VOTE</b></div>
            <div className="meeting-content">
              <p>Select the slime you distrust. AI crewmates will cast their own private votes.</p>
              <div className="vote-grid">
                {meeting.candidates.map((player) => (
                  <button key={player.id} disabled={!player.alive || player.id === "you"} onClick={() => engineRef.current?.vote(player.id)}>
                    <span className="vote-slime" style={{ "--vote-color": player.alive ? player.color : "#53616b" } as React.CSSProperties}><i /><i /></span>
                    <b>{player.name}</b><small>{player.alive ? (player.id === "you" ? "YOU" : "VOTE") : "ELIMINATED"}</small>
                  </button>
                ))}
              </div>
              <button className="skip-vote" onClick={() => engineRef.current?.vote(null)}>SKIP VOTE</button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="modal-backdrop result-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className="result-card">
            <small>SIMULATION COMPLETE</small>
            <h2 id="result-title">{result}</h2>
            <p>The hidden role was assigned privately. No public character trait revealed allegiance.</p>
            <button onClick={onExit}>RETURN TO LOBBY</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  const [match, setMatch] = useState<{ count: number; role: RoleChoice } | null>(null);
  return match ? <Game count={match.count} roleChoice={match.role} onExit={() => setMatch(null)} /> : <Lobby onLaunch={(count, role) => setMatch({ count, role })} />;
}
