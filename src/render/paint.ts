import { compareOffer } from "@/game/compare";
import { timerLabel } from "@/game/sim";
import { W, type RunState } from "@/game/types";

/**
 * The 2D readout drawn over the 3D lane. One look: white numerals with a
 * dark stroke, cyan for the player's things, red for damage and danger.
 */

const FONT = '"Avenir Next Condensed", "Avenir Next", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const INK = "rgba(6, 10, 16, 0.92)";
const PAPER = "#ffffff";
const CYAN = "#4ff1ff";
const RED = "#ff2a1f";
const AMBER = "#ffd166";

export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: RunState,
  project: (x: number, y: number) => { x: number; y: number },
) {
  for (const crate of state.crates) {
    if (!crate.alive) continue;
    const point = project(crate.x, crate.y);
    if (point.y < 70 || point.y > state.playerY - 24) continue;
    const comparison = compareOffer(state.weapon, crate.offer, state.companion);
    drawPlate(ctx, point.x, point.y - 66, comparison.title, comparison.lines.slice(0, 2), comparison.owned);
  }
  for (const floater of state.floaters) {
    const point = project(floater.x, floater.y);
    ctx.globalAlpha = Math.max(0, floater.life * 1.6);
    const damage = floater.kind === "bad";
    const good = floater.kind === "good";
    outlined(ctx, floater.text, point.x, point.y, damage ? RED : good ? CYAN : PAPER, damage ? 34 : 22, 800);
    ctx.globalAlpha = 1;
  }
  const heavy = state.enemies
    .filter((enemy) => enemy.alive && enemy.maxHp >= 80 && enemy.sprite !== "tires")
    .sort((a, b) => b.y - a.y)[0];
  if (heavy) {
    const ratio = Math.max(0, Math.min(1, heavy.hp / heavy.maxHp));
    const barW = 180;
    const barX = W / 2 - barW / 2;
    roundRect(ctx, barX - 2, 52, barW + 4, 18, 6);
    ctx.fillStyle = INK;
    ctx.fill();
    roundRect(ctx, barX, 54, barW * ratio, 14, 5);
    ctx.fillStyle = RED;
    ctx.fill();
    outlined(ctx, String(Math.max(0, Math.ceil(heavy.hp))), W / 2, 61, PAPER, 13, 800);
  }
  drawHearts(ctx, 24, 30, state.hearts);
  // Mute/Pause sit in the top-right, so the score stays on the midline below them.
  outlined(ctx, state.score.toLocaleString("en-US"), W / 2, 54, PAPER, 26, 800);
  const timer = timerLabel(state);
  if (timer.text) outlined(ctx, timer.text, W / 2, 80, timer.urgent ? RED : PAPER, 20, 800);
  if (state.chain > 1) {
    const chain = state.multiplier > 1 ? `x${state.multiplier}` : `chain ${state.chain}`;
    outlined(ctx, chain, W / 2 + 70, 30, CYAN, state.multiplier > 1 ? 20 : 14, 800, "left");
  }
  outlined(ctx, state.weapon.name.toUpperCase(), 20, 60, CYAN, 13, 800, "left", 0.08);
  if (state.companion) outlined(ctx, "+ BUDDY", 20, 78, CYAN, 11, 800, "left", 0.08);
  if (state.daily) outlined(ctx, "DAILY", 20, 96, AMBER, 11, 800, "left", 0.1);
  if (state.practice) outlined(ctx, "PRACTICE", W / 2, 100, AMBER, 12, 800, "center", 0.1);
  if (state.banner && state.bannerT > 0) {
    ctx.globalAlpha = Math.min(1, state.bannerT * 2);
    drawBanner(ctx, W / 2, 150, state.banner, state.bannerSub);
    ctx.globalAlpha = 1;
  }
}

function drawHearts(ctx: CanvasRenderingContext2D, x: number, y: number, hearts: number) {
  for (let i = 0; i < 3; i += 1) heart(ctx, x + i * 26, y, i < hearts);
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, filled: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(-15, -5, -8, -15, 0, -6);
  ctx.bezierCurveTo(8, -15, 15, -5, 0, 7);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = filled ? RED : "rgba(255,255,255,0.22)";
  ctx.fill();
  if (filled) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  title: string,
  lines: string[],
  owned: boolean,
) {
  const width = 150;
  const height = 22 + lines.length * 15;
  const left = Math.max(8, Math.min(W - width - 8, x - width / 2));
  const top = y - height;
  roundRect(ctx, left, top, width, height, 7);
  ctx.fillStyle = "rgba(6, 12, 20, 0.78)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = owned ? "rgba(255,255,255,0.45)" : CYAN;
  ctx.stroke();
  let cursor = top + 14;
  flat(ctx, title.toUpperCase(), left + width / 2, cursor, owned ? "rgba(255,255,255,0.7)" : CYAN, 13, 800, 0.06);
  for (const line of lines) {
    cursor += 15;
    flat(ctx, line, left + width / 2, cursor, PAPER, 12, 600);
  }
}

function drawBanner(ctx: CanvasRenderingContext2D, x: number, y: number, title: string, sub: string | null) {
  const width = Math.min(W - 24, 300);
  const height = sub ? 66 : 48;
  const left = x - width / 2;
  const top = y - height / 2;
  roundRect(ctx, left, top, width, height, 10);
  ctx.fillStyle = "rgba(6, 12, 20, 0.82)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = RED;
  ctx.stroke();
  flat(ctx, title.toUpperCase(), x, top + (sub ? 24 : 24), PAPER, 22, 800, 0.08);
  if (sub) flat(ctx, sub, x, top + 48, "rgba(255,255,255,0.8)", 13, 600);
}

/** White-on-dark numerals the way the reference HUDs draw them. */
function outlined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  weight: number,
  align: CanvasTextAlign = "center",
  tracking = 0,
) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (tracking) ctx.letterSpacing = `${tracking}em`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function flat(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  weight: number,
  tracking = 0,
) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  if (tracking) ctx.letterSpacing = `${tracking}em`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
