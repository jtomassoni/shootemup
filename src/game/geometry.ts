import { W } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  hw: number,
  hh: number,
): boolean {
  const nx = Math.max(x - hw, Math.min(cx, x + hw));
  const ny = Math.max(y - hh, Math.min(cy, y + hh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function rectsOverlap(
  ax: number,
  ay: number,
  ahw: number,
  ahh: number,
  bx: number,
  by: number,
  bhw: number,
  bhh: number,
): boolean {
  return Math.abs(ax - bx) <= ahw + bhw && Math.abs(ay - by) <= ahh + bhh;
}

export function laneCenter(lane: number): number {
  const centers = [52, 117, 195, 273, 338];
  return centers[clamp(lane, 0, 4)] ?? 195;
}

/** Spread `count` columns across the road. Lane 0 is the left edge. */
export function laneX(lane: number, count: number): number {
  const margin = 32;
  const span = W - margin * 2;
  if (count <= 1) return W / 2;
  return margin + (span * clamp(lane, 0, count - 1)) / (count - 1);
}
