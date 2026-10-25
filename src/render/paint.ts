import { compareOffer } from "@/game/compare";
import { destinationById } from "@/game/content";
import type { Avatar } from "@/game/content";
import { timerLabel } from "@/game/sim";
import { H, W, type Enemy, type RunState, type StyleId } from "@/game/types";

export type Pose = {
  flash: boolean;
  age: number;
  mode: string;
  lean: number;
  swing: number;
};

const FONT = '"Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif';
const PIXEL = 'ui-monospace, "Courier New", monospace';

let pixelCanvas: HTMLCanvasElement | null = null;

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: RunState,
  style: StyleId,
  avatar: Avatar,
  showHitboxes: boolean,
  reducedMotion: boolean,
) {
  const shake = reducedMotion ? 0 : state.shake;
  ctx.save();
  if (shake > 0) {
    ctx.translate(Math.sin(state.time * 48) * shake, Math.cos(state.time * 37) * shake * 0.6);
  }
  if (style === "pixel") {
    const buffer = pixelBuffer();
    const off = buffer.getContext("2d");
    if (!off) return;
    off.setTransform(buffer.width / W, 0, 0, buffer.height / H, 0, 0);
    off.clearRect(0, 0, W, H);
    paintWorld(off, state, style, avatar);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buffer, 0, 0, W, H);
  } else {
    ctx.imageSmoothingEnabled = true;
    paintWorld(ctx, state, style, avatar);
  }
  paintReadout(ctx, state, style);
  if (showHitboxes) paintHitboxes(ctx, state);
  ctx.restore();
}

export function drawPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: StyleId,
  destinationId: string,
  avatar: Avatar,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(width / W, height / H);
  drawBackground(ctx, style, destinationId, 4);
  drawSprite(ctx, style, destinationId === "maryland" ? "crab-boss" : "goat-boss", 250, 250, 48, 42, {
    flash: false, age: 1.2, mode: "strafe", lean: 0, swing: 0,
  });
  drawActor(ctx, style, avatar, 150, 690, 0.2, "espresso", 0, false);
  ctx.restore();
}

function pixelBuffer() {
  if (!pixelCanvas) {
    pixelCanvas = document.createElement("canvas");
    pixelCanvas.width = Math.round(W / 3);
    pixelCanvas.height = Math.round(H / 3);
  }
  return pixelCanvas;
}

function paintWorld(ctx: CanvasRenderingContext2D, state: RunState, style: StyleId, avatar: Avatar) {
  drawBackground(ctx, style, state.destination, state.time);
  const actors = state.enemies.filter((enemy) => enemy.alive).slice().sort((a, b) => a.y - b.y);
  for (const crate of state.crates) {
    if (crate.alive) drawCrate(ctx, style, crate.x, crate.y, crate.offer.type === "companion" ? "#7bdff2" : weaponColor(state, crate.offer));
  }
  for (const enemy of actors) drawEnemy(ctx, style, enemy);
  for (const bullet of state.bullets) {
    if (bullet.alive) drawBullet(ctx, style, bullet.x, bullet.y, bullet.kind, bullet.color, bullet.hw, bullet.age);
  }
  for (const ring of state.rings) {
    ctx.beginPath();
    ctx.strokeStyle = ring.color;
    ctx.globalAlpha = Math.max(0, ring.life * 3);
    ctx.lineWidth = style === "illustrated" ? 4 : 3;
    ctx.arc(ring.x, ring.y, ring.r * (1 - ring.life), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const blink = state.iframes > 0 && Math.sin(state.time * 28) > 0;
  if (!blink) {
    drawActor(ctx, style, avatar, state.playerX, state.playerY, state.lean, state.weapon.projectile, state.swing, state.muzzle > 0);
    if (state.companion) {
      drawActor(ctx, style, { ...avatar, shirt: "#7bdff2", prop: "bike" }, state.playerX + 34, state.playerY + 8, state.lean, "bolt", 0, false, 0.72);
    }
  }
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: RunState,
  style: StyleId,
  project: (x: number, y: number) => { x: number; y: number },
) {
  for (const crate of state.crates) {
    if (!crate.alive) continue;
    const point = project(crate.x, crate.y);
    if (point.y < 70 || point.y > state.playerY - 24) continue;
    const comparison = compareOffer(state.weapon, crate.offer, state.companion);
    drawPlate(ctx, style, point.x, point.y - 18, comparison.title, comparison.lines, comparison.footer, `${crate.hitsLeft} hits`);
  }
  for (const floater of state.floaters) {
    const point = project(floater.x, floater.y);
    ctx.globalAlpha = Math.max(0, floater.life * 1.6);
    inkText(ctx, floater.text, point.x, point.y, floater.kind === "bad" ? "#9b2226" : "#1c3144", 18, true);
    ctx.globalAlpha = 1;
  }
  drawHearts(ctx, 22, 28, state.hearts);
  const timer = timerLabel(state);
  inkText(ctx, timer.text, W / 2, 36, timer.urgent ? "#9b2226" : "#1c3144", 22, true);
  inkText(ctx, state.score.toLocaleString("en-US"), W - 22, 36, "#1c3144", 22, true, "right");
  if (state.chain > 1) {
    const chain = state.multiplier > 1 ? `x${state.multiplier}` : `chain ${state.chain}`;
    inkText(ctx, chain, W - 22, 62, "#9b2226", state.multiplier > 1 ? 20 : 14, true, "right");
  }
  inkText(ctx, state.weapon.name, 22, 78, "#1c3144", 15, false, "left");
  if (state.companion) inkText(ctx, "+ buddy", 22, 98, "#1d3557", 13, false, "left");
  if (state.daily) inkText(ctx, "Daily", 22, 118, "#9b2226", 12, true, "left");
  if (state.practice) inkText(ctx, "Practice", W / 2, 62, "#1d3557", 13, true);
  if (state.banner && state.bannerT > 0) {
    ctx.globalAlpha = Math.min(1, state.bannerT * 2);
    drawPlate(ctx, style, W / 2, 150, state.banner, state.bannerSub ? [state.bannerSub] : [], "", "");
    ctx.globalAlpha = 1;
  }
}

function paintReadout(ctx: CanvasRenderingContext2D, state: RunState, style: StyleId) {
  for (const crate of state.crates) {
    if (!crate.alive || crate.y < 48 || crate.y > state.playerY - 10) continue;
    const comparison = compareOffer(state.weapon, crate.offer, state.companion);
    drawPlate(ctx, style, crate.x, crate.y - 36, comparison.title, comparison.lines, comparison.footer, `${crate.hitsLeft} hits`);
  }
  for (const floater of state.floaters) {
    ctx.globalAlpha = Math.max(0, floater.life * 1.6);
    inkText(ctx, floater.text, floater.x, floater.y, floater.kind === "bad" ? "#9b2226" : "#1c3144", 18, true);
    ctx.globalAlpha = 1;
  }
  drawHearts(ctx, 22, 28, state.hearts);
  const timer = timerLabel(state);
  inkText(ctx, timer.text, W / 2, 34, timer.urgent ? "#9b2226" : "#1c3144", 22, true);
  inkText(ctx, state.score.toLocaleString("en-US"), 22, 62, "#1c3144", 18, true, "left");
  if (state.chain > 0) {
    const chain = state.multiplier > 1 ? `x${state.multiplier}` : `chain ${state.chain}`;
    inkText(ctx, chain, 118, 62, "#9b2226", state.multiplier > 1 ? 18 : 14, true, "left");
  }
  inkText(ctx, state.weapon.name, 22, 86, "#1c3144", 15, false, "left");
  if (state.companion) inkText(ctx, "+ buddy", 22, 106, "#1d3557", 13, false, "left");
  if (state.daily) inkText(ctx, "Daily", 22, 126, "#9b2226", 12, true, "left");
  if (state.practice) inkText(ctx, "Practice", W / 2, 62, "#1d3557", 13, true);
  if (state.banner && state.bannerT > 0) {
    ctx.globalAlpha = Math.min(1, state.bannerT * 2);
    drawPlate(ctx, style, W / 2, 168, state.banner, state.bannerSub ? [state.bannerSub] : [], "", "");
    ctx.globalAlpha = 1;
  }
}

function paintHitboxes(ctx: CanvasRenderingContext2D, state: RunState) {
  ctx.save();
  ctx.strokeStyle = "#ff2d95";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(state.playerX, state.playerY, 16, 0, Math.PI * 2);
  ctx.stroke();
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    ctx.strokeRect(enemy.x - enemy.hw, enemy.y - enemy.hh, enemy.hw * 2, enemy.hh * 2);
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, style: StyleId, destinationId: string, time: number) {
  const destination = destinationById(destinationId);
  const maryland = destinationId === "maryland";
  if (style === "pixel") {
    ctx.fillStyle = destination.sky[0];
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = destination.sky[1];
    ctx.fillRect(0, 180, W, 220);
    stepMountain(ctx, 280, maryland ? "#8aa4b8" : "#7ea0bf", 52);
    stepMountain(ctx, 360, maryland ? "#5f7f72" : "#4f7d62", 40);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, destination.sky[0]);
    sky.addColorStop(0.55, destination.sky[1]);
    sky.addColorStop(1, maryland ? "#d5e3ea" : "#f7fbff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (style === "chunky") {
      ctx.fillStyle = "#fff6d8";
      ctx.beginPath();
      ctx.arc(300, 110, 36, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#1c2430";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(300, 108, 28, 0, Math.PI * 2);
      ctx.stroke();
    }
    softMountain(ctx, style, 300, maryland ? "#9bb4c4" : "#8eb4d4", 78);
    softMountain(ctx, style, 390, maryland ? "#6d9084" : "#3f7d62", 64);
  }

  const roadY = 690;
  ctx.fillStyle = destination.road;
  if (style === "pixel") ctx.fillRect(0, roadY, W, H - roadY);
  else {
    ctx.beginPath();
    ctx.moveTo(0, roadY + 20);
    ctx.lineTo(W, roadY + 8);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
  }
  ctx.strokeStyle = style === "illustrated" ? "#f4d35e" : "#f4e6a6";
  ctx.lineWidth = style === "pixel" ? 4 : 6;
  ctx.setLineDash([22, 18]);
  ctx.lineDashOffset = -((time * 140) % 40);
  ctx.beginPath();
  ctx.moveTo(W / 2, roadY + 36);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!maryland) {
    const trainX = ((time * 36) % (W + 80)) - 40;
    blob(ctx, style, trainX, 560, 16, 8, "#e76f51");
    blob(ctx, style, trainX + 22, 560, 10, 7, "#f4f1de");
  } else {
    ctx.strokeStyle = style === "pixel" ? "#1d3557" : "#1d3557";
    ctx.lineWidth = style === "illustrated" ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(40, 180);
    ctx.lineTo(180, 300);
    ctx.lineTo(40, 300);
    ctx.moveTo(350, 170);
    ctx.lineTo(230, 300);
    ctx.stroke();
    const grass = (time * 40) % 30;
    ctx.fillStyle = "#6a8f71";
    for (let x = -grass; x < W; x += 30) ctx.fillRect(x, 640, 8, 28);
  }
}

function softMountain(ctx: CanvasRenderingContext2D, style: StyleId, base: number, color: string, height: number) {
  ctx.beginPath();
  ctx.moveTo(-10, base);
  for (let x = 0; x <= W + 48; x += 48) {
    const peak = x % 96 === 0 ? height : height * 0.62;
    ctx.lineTo(x, base - peak);
  }
  ctx.lineTo(W + 20, base + 8);
  ctx.lineTo(W + 20, base + 80);
  ctx.lineTo(-20, base + 80);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (style === "illustrated") {
    ctx.strokeStyle = "#1c2430";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function stepMountain(ctx: CanvasRenderingContext2D, base: number, color: string, height: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let x = 0; x <= W; x += 24) {
    const y = base - height + ((x / 24) % 2) * 18;
    ctx.lineTo(x, y);
    ctx.lineTo(x + 24, y);
  }
  ctx.lineTo(W + 8, base + 10);
  ctx.lineTo(-8, base + 10);
  ctx.closePath();
  ctx.fill();
}

function drawEnemy(ctx: CanvasRenderingContext2D, style: StyleId, enemy: Enemy) {
  drawSprite(ctx, style, enemy.sprite, enemy.x, enemy.y, enemy.hw, enemy.hh, {
    flash: enemy.flash > 0,
    age: enemy.age,
    mode: enemy.dormant ? "arrive" : enemy.mode,
    lean: enemy.vx,
    swing: enemy.mode === "swing" || enemy.mode === "windup" ? 1 : 0,
  });
  if ((enemy.kind === "boss" || enemy.kind === "miniboss") && !enemy.dormant) {
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = "rgba(28,36,48,0.35)";
    ctx.fillRect(enemy.x - 40, enemy.y - enemy.hh - 16, 80, 6);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(enemy.x - 40, enemy.y - enemy.hh - 16, 80 * ratio, 6);
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, style: StyleId, sprite: string, x: number, y: number, hw: number, hh: number, pose: Pose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.18, 1.18);
  ctx.translate(-x, -y);
  if (pose.flash) ctx.globalAlpha = 0.55;
  const body = spriteColor(sprite);
  if (sprite.includes("goat") || sprite === "ram") {
    blob(ctx, style, x, y + 4, hw * 0.72, hh * 0.48, body);
    blob(ctx, style, x + hw * 0.15, y - hh * 0.45, hw * 0.38, hh * 0.36, "#f6f1e7");
    horn(ctx, style, x - hw * 0.05, y - hh * 0.85, -0.8);
    horn(ctx, style, x + hw * 0.28, y - hh * 0.85, 0.8);
    eye(ctx, style, x + hw * 0.22, y - hh * 0.48, pose.mode === "windup" || pose.mode === "dash");
    if (sprite === "ram") blob(ctx, style, x - hw * 0.45, y - hh * 0.2, hw * 0.28, hh * 0.18, "#d6c4a8");
  } else if (sprite.includes("elk")) {
    blob(ctx, style, x, y, hw * 0.7, hh * 0.55, "#8d6a4a");
    blob(ctx, style, x + hw * 0.35, y - hh * 0.35, hw * 0.28, hh * 0.3, "#a4784e");
    ctx.strokeStyle = "#6b4f34";
    ctx.lineWidth = style === "pixel" ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(x + hw * 0.2, y - hh * 0.7);
    ctx.lineTo(x - hw * 0.1, y - hh * 1.05);
    ctx.moveTo(x + hw * 0.45, y - hh * 0.65);
    ctx.lineTo(x + hw * 0.7, y - hh * 1.02);
    ctx.stroke();
    eye(ctx, style, x + hw * 0.48, y - hh * 0.35, true);
  } else if (sprite === "hail") {
    blob(ctx, style, x, y, hw, hh, "#f7fbff");
    blob(ctx, style, x - 4, y - 3, hw * 0.3, hh * 0.25, "#d7eef8");
  } else if (sprite === "driver" || sprite === "car") {
    blob(ctx, style, x, y, hw, hh * 0.7, sprite === "car" ? "#1d3557" : "#e76f51");
    blob(ctx, style, x, y - hh * 0.35, hw * 0.55, hh * 0.38, "#d7f3ff");
    blob(ctx, style, x - hw * 0.55, y + hh * 0.35, hw * 0.22, hh * 0.22, "#1c2430");
    blob(ctx, style, x + hw * 0.55, y + hh * 0.35, hw * 0.22, hh * 0.22, "#1c2430");
  } else if (sprite === "cart") {
    blob(ctx, style, x, y + 4, hw * 0.8, hh * 0.45, "#6f4e37");
    blob(ctx, style, x, y - hh * 0.35, hw * 0.28, hh * 0.4, "#f4f1de");
    blob(ctx, style, x + 8, y - hh * 0.55, 4, 7, "#2a9d8f");
  } else if (sprite === "train" || sprite === "skiff") {
    blob(ctx, style, x, y, hw * 0.92, hh * 0.62, sprite === "skiff" ? "#bc6c25" : "#b08968");
    if (sprite === "train") {
      blob(ctx, style, x - hw * 0.55, y - hh * 0.15, hw * 0.2, hh * 0.45, "#6f4e37");
      blob(ctx, style, x - hw * 0.2, y - hh * 0.45, 6, 8, "#ced4da");
    }
  } else if (sprite === "luggage") {
    blob(ctx, style, x, y, hw * 0.8, hh * 0.7, "#c1121f");
    ctx.fillStyle = "#f4e6a6";
    ctx.fillRect(x - 4, y - hh * 0.75, 8, 8);
  } else if (sprite.includes("crab")) {
    blob(ctx, style, x, y, hw * 0.78, hh * 0.48, "#e85d4c");
    claw(ctx, style, x - hw * 0.7, y - hh * 0.1, pose.swing > 0 ? -0.6 : 0.4);
    claw(ctx, style, x + hw * 0.7, y - hh * 0.1, pose.swing > 0 ? 0.8 : -0.2);
    eye(ctx, style, x - 8, y - hh * 0.45, true);
    eye(ctx, style, x + 10, y - hh * 0.45, true);
    if (sprite === "crab-boss") {
      ctx.save();
      ctx.translate(x + hw * 0.2, y - hh * 0.2);
      ctx.rotate(pose.swing > 0 ? -0.9 : 0.4);
      blob(ctx, style, 20, -28, 10, 26, "#6b3f2a");
      blob(ctx, style, 20, -52, 22, 14, "#c1121f");
      ctx.restore();
    }
  } else if (sprite.includes("gull")) {
    blob(ctx, style, x, y, hw * 0.7, hh * 0.45, "#f7f3ea");
    ctx.strokeStyle = "#1c2430";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x - hw * 0.2, y - hh * 0.2);
    ctx.moveTo(x + hw * 0.2, y);
    ctx.lineTo(x + hw, y - hh * 0.35);
    ctx.stroke();
    blob(ctx, style, x + hw * 0.55, y - hh * 0.1, hw * 0.18, hh * 0.16, "#f4a261");
    eye(ctx, style, x + hw * 0.2, y - hh * 0.15, true);
  } else if (sprite === "shaker") {
    blob(ctx, style, x, y + 4, hw * 0.55, hh * 0.7, "#f4f1de");
    blob(ctx, style, x, y - hh * 0.55, hw * 0.4, hh * 0.18, "#c1121f");
  } else if (sprite === "pothole" || sprite === "hole-boss") {
    blob(ctx, style, x, y, hw, hh * 0.55, "#2b2d42");
    blob(ctx, style, x, y, hw * 0.55, hh * 0.28, "#6c757d");
    if (sprite === "hole-boss") {
      blob(ctx, style, x + 16, y - hh, 8, 22, "#6b3f2a");
      blob(ctx, style, x + 16, y - hh - 18, 16, 10, "#c1121f");
    }
  } else {
    blob(ctx, style, x, y, hw * 0.7, hh * 0.6, body);
  }
  ctx.restore();
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  style: StyleId,
  avatar: Avatar,
  x: number,
  y: number,
  lean: number,
  projectile: string,
  swing: number,
  muzzle: boolean,
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean * 0.18);
  ctx.scale(scale, scale);
  if (style === "chunky") {
    ctx.fillStyle = "rgba(28,36,48,0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  blob(ctx, style, 0, 4, 16, 14, avatar.shirt);
  blob(ctx, style, 0, -16, 11, 11, avatar.skin);
  prop(ctx, style, avatar);
  eye(ctx, style, -3, -18, false);
  eye(ctx, style, 4, -18, false);
  weaponArt(ctx, style, projectile, swing, muzzle, avatar.accent);
  ctx.restore();
}

function prop(ctx: CanvasRenderingContext2D, style: StyleId, avatar: Avatar) {
  if (avatar.prop === "cap") blob(ctx, style, 0, -26, 12, 4, "#f7f3ea");
  else if (avatar.prop === "glasses") {
    ctx.strokeStyle = avatar.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(-8, -22, 7, 5);
    ctx.strokeRect(1, -22, 7, 5);
  } else if (avatar.prop === "helmet") blob(ctx, style, 0, -24, 12, 8, avatar.accent);
  else if (avatar.prop === "conductor") blob(ctx, style, 0, -28, 13, 4, "#1d3557");
  else if (avatar.prop === "toque") blob(ctx, style, 0, -30, 9, 10, "#f7f3ea");
  else if (avatar.prop === "pilot") blob(ctx, style, 2, -27, 14, 4, "#1d3557");
  else if (avatar.prop === "ranger") blob(ctx, style, 0, -30, 14, 3, "#606c38");
  else if (avatar.prop === "beanie") blob(ctx, style, 0, -27, 12, 7, "#1d3557");
  else if (avatar.prop === "bike") blob(ctx, style, 0, -26, 12, 6, avatar.accent);
  else blob(ctx, style, 8, 2, 8, 10, "#f4e6c8");
}

function weaponArt(ctx: CanvasRenderingContext2D, style: StyleId, projectile: string, swing: number, muzzle: boolean, accent: string) {
  ctx.save();
  ctx.translate(0, -8);
  if (projectile === "mallet") {
    ctx.rotate(-0.4 - swing * 0.9);
    blob(ctx, style, 0, -16, 4, 16, "#6b3f2a");
    blob(ctx, style, 0, -34, 14, 8, "#c1121f");
  } else if (projectile === "train") {
    blob(ctx, style, 0, -20, 12, 8, "#e76f51");
    blob(ctx, style, -8, -26, 5, 5, "#6f4e37");
  } else if (projectile === "pot") {
    blob(ctx, style, 0, -18, 10, 8, "#2a9d8f");
    blob(ctx, style, 0, -26, 6, 3, "#1c3144");
  } else if (projectile === "horn") {
    blob(ctx, style, 0, -18, 8, 10, "#f4a261");
  } else if (projectile === "pellet") {
    blob(ctx, style, -8, -18, 5, 8, accent);
    blob(ctx, style, 0, -22, 5, 8, accent);
    blob(ctx, style, 8, -18, 5, 8, accent);
  } else {
    blob(ctx, style, 0, -18, 4, 12, accent);
  }
  if (muzzle) {
    ctx.fillStyle = "#fff3bf";
    ctx.fillRect(-4, -34, 8, 8);
  }
  ctx.restore();
}

function drawCrate(ctx: CanvasRenderingContext2D, style: StyleId, x: number, y: number, color: string) {
  blob(ctx, style, x, y, 22, 16, "#f4f1de");
  blob(ctx, style, x, y - 2, 16, 4, color);
}

function drawBullet(
  ctx: CanvasRenderingContext2D,
  style: StyleId,
  x: number,
  y: number,
  kind: string,
  color: string,
  hw: number,
  age: number,
) {
  if (kind === "train") blob(ctx, style, x, y, 14, 9, color);
  else if (kind === "pot") blob(ctx, style, x, y, 9, 8, color);
  else if (kind === "mallet") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(age * 8);
    blob(ctx, style, 0, 0, Math.max(16, hw * 0.45), 10, color);
    ctx.restore();
  } else if (kind === "horn") blob(ctx, style, x, y, 16, 7, color);
  else if (kind === "rock") blob(ctx, style, x, y, 8, 8, "#d9d3c7");
  else if (kind === "blob") blob(ctx, style, x, y, 7, 8, color);
  else blob(ctx, style, x, y, 4, 8, color);
}

function drawHearts(ctx: CanvasRenderingContext2D, x: number, y: number, hearts: number) {
  for (let i = 0; i < 3; i += 1) heart(ctx, x + i * 28, y, i < hearts);
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, filled: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-16, -6, -8, -16, 0, -6);
  ctx.bezierCurveTo(8, -16, 16, -6, 0, 6);
  ctx.fillStyle = filled ? "#e85d4c" : "rgba(255,255,255,0.35)";
  ctx.strokeStyle = "#1c2430";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  if (filled) {
    ctx.fillStyle = "#fff1d6";
    ctx.beginPath();
    ctx.arc(-4, -4, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlate(
  ctx: CanvasRenderingContext2D,
  style: StyleId,
  x: number,
  y: number,
  title: string,
  lines: string[],
  footer: string,
  hits: string,
) {
  const width = 156;
  const body = [title, ...lines, footer, hits].filter(Boolean);
  const height = 16 + body.length * 15;
  const left = Math.max(8, Math.min(W - width - 8, x - width / 2));
  const top = y - height;
  ctx.fillStyle = style === "pixel" ? "#f4f1de" : "rgba(255,250,240,0.94)";
  ctx.strokeStyle = "#1c2430";
  ctx.lineWidth = style === "illustrated" ? 3 : 2;
  if (style === "pixel") {
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
  } else {
    roundRect(ctx, left, top, width, height, style === "chunky" ? 14 : 6);
    ctx.fill();
    if (style === "illustrated") ctx.stroke();
  }
  let cursor = top + 16;
  inkText(ctx, title, left + width / 2, cursor, "#1c3144", 14, true);
  for (const line of lines) {
    cursor += 15;
    inkText(ctx, line, left + width / 2, cursor, "#1c3144", 12, false);
  }
  if (footer) {
    cursor += 15;
    inkText(ctx, footer, left + width / 2, cursor, "#6c757d", 11, false);
  }
  if (hits) {
    cursor += 15;
    inkText(ctx, hits, left + width / 2, cursor, "#9b2226", 12, true);
  }
}

function inkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  bold: boolean,
  align: CanvasTextAlign = "center",
) {
  ctx.font = `${bold ? 700 : 600} ${size}px ${size <= 13 ? PIXEL : FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,250,240,0.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function blob(ctx: CanvasRenderingContext2D, style: StyleId, x: number, y: number, rx: number, ry: number, fill: string) {
  if (style === "pixel") {
    ctx.fillStyle = "#1c2430";
    ctx.fillRect(x - rx - 1, y - ry - 1, rx * 2 + 2, ry * 2 + 2);
    ctx.fillStyle = fill;
    ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    return;
  }
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (style === "illustrated" || style === "chunky") {
    ctx.lineWidth = style === "illustrated" ? 3.5 : 2;
    ctx.strokeStyle = "#1c2430";
    ctx.stroke();
  }
  if (style === "chunky") {
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.25, y - ry * 0.3, Math.max(1, rx * 0.28), Math.max(1, ry * 0.18), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function eye(ctx: CanvasRenderingContext2D, style: StyleId, x: number, y: number, angry: boolean) {
  blob(ctx, style, x, y, style === "illustrated" ? 3.2 : 2.4, style === "illustrated" ? 3.4 : 2.6, "#f7f3ea");
  blob(ctx, style, x, y + 0.4, 1.2, 1.4, "#1c2430");
  if (angry && style !== "pixel") {
    ctx.strokeStyle = "#1c2430";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 3);
    ctx.lineTo(x + 3, y - 1);
    ctx.stroke();
  }
}

function horn(ctx: CanvasRenderingContext2D, style: StyleId, x: number, y: number, lean: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  blob(ctx, style, 0, 0, 3, 10, "#f4e6a6");
  ctx.restore();
}

function claw(ctx: CanvasRenderingContext2D, style: StyleId, x: number, y: number, rotation: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  blob(ctx, style, 0, 0, 10, 6, "#ffb4a2");
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function weaponColor(state: RunState, offer: RunState["crates"][number]["offer"]) {
  if (offer.type === "companion") return "#7bdff2";
  const known = offer.weaponId;
  if (known === "espresso") return "#6f4e37";
  if (known === "hail-spread") return "#8ecae6";
  if (known === "cog-train") return "#e76f51";
  if (known === "pueblo-pot") return "#2a9d8f";
  if (known === "crab-mallet") return "#c1121f";
  if (known === "bay-spice") return "#9b2226";
  if (known === "ferry-horn") return "#f4a261";
  return state.weapon.color;
}

function spriteColor(sprite: string) {
  if (sprite.includes("goat") || sprite === "ram") return "#f4f1de";
  if (sprite.includes("crab")) return "#e85d4c";
  if (sprite.includes("elk")) return "#8d6a4a";
  return "#f4a261";
}
