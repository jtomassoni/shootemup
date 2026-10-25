import { singleTargetDps, weaponById } from "./content";
import { clamp } from "./geometry";
import { pointerFromAim } from "./sim";
import { PLAYER_R, PLAYER_Y, W, type Input, type RunState } from "./types";

/** A stand-in player used to check that a round can be won. */
export function botInput(state: RunState): Input {
  const target = pickTarget(state);
  if (!target) return { pointerX: W / 2, left: false, right: false };
  const angle = interceptAngle(target.x, target.y, target.vy, state.weapon.projectileSpeed);
  return { pointerX: pointerFromAim(angle), left: false, right: false };
}

function pickTarget(state: RunState): { x: number; y: number; vy: number } | null {
  const incoming = state.enemies
    .filter((enemy) => enemy.alive && !enemy.dormant && enemy.shootable && enemy.safeGap === 1 && enemy.y < PLAYER_Y && enemy.y > -30)
    .sort((a, b) => b.y - a.y)[0];
  if (incoming) return incoming;

  const threat = state.enemies
    .filter((enemy) => {
      if (!enemy.alive || enemy.dormant || !enemy.shootable) return false;
      if (enemy.y > PLAYER_Y + 8 || enemy.y < PLAYER_Y - 480) return false;
      return Math.abs(enemy.x - W / 2) < enemy.hw + PLAYER_R + 64;
    })
    .sort((a, b) => b.y - a.y)[0];
  if (threat) return threat;

  const shooter = state.enemies
    .filter((enemy) => enemy.alive && !enemy.dormant && enemy.shootable && enemy.pattern === "shooter" && enemy.y < PLAYER_Y)
    .sort((a, b) => b.y - a.y)[0];
  if (shooter) return shooter;

  const crates = state.crates
    .filter((crate) => crate.alive && crate.y > 40 && crate.y < PLAYER_Y - 40 && desire(crate.offer, state) > 0)
    .sort((a, b) => desire(b.offer, state) - desire(a.offer, state) || b.y - a.y);
  if (crates[0]) return crates[0];

  let nearest: { x: number; y: number; vy: number } | null = null;
  let best = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.dormant || !enemy.shootable) continue;
    if (enemy.y < -20 || enemy.y > PLAYER_Y) continue;
    const rank = PLAYER_Y - enemy.y + Math.abs(enemy.x - W / 2) * 0.35;
    if (rank < best) {
      best = rank;
      nearest = enemy;
    }
  }
  return nearest;
}

/** Angle that meets a target moving straight down the screen. */
function interceptAngle(x: number, y: number, vy: number, speed: number) {
  const dx = x - W / 2;
  const dy = Math.max(36, PLAYER_Y - y);
  const lead = Math.hypot(dx, dy);
  const offset = clamp((dx * Math.max(0, vy)) / (Math.max(80, speed) * lead), -1, 1);
  return Math.atan2(dx, dy) + Math.asin(offset);
}

function desire(offer: RunState["crates"][number]["offer"], state: RunState): number {
  if (offer.type === "companion") return state.companion ? -1 : 72;
  if (offer.weaponId === state.weapon.id) return -1;
  const next = singleTargetDps(weaponById(offer.weaponId));
  if (next < singleTargetDps(state.weapon) + 4) return -1;
  return next;
}
