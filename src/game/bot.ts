import { singleTargetDps, weaponById } from "./content";
import { clamp } from "./geometry";
import { PLAYER_Y, W, type Input, type RunState } from "./types";

type Hazard = { x: number; y: number; reach: number };

/** A stand-in player used to check that a round can be won. */
export function botInput(state: RunState): Input {
  return { pointerX: botTarget(state), left: false, right: false };
}

export function botTarget(state: RunState): number {
  const hazards = collectHazards(state);
  const goal = desiredX(state);
  const ideal = pickX(state.playerX, goal, hazards, 36, W - 36);
  const crowded = hazards.some((hazard) => Math.abs(hazard.x - state.playerX) < hazard.reach && hazard.y > PLAYER_Y - 170);
  if (crowded) return ideal;
  return clamp(ideal, state.playerX - 96, state.playerX + 96);
}

function collectHazards(state: RunState): Hazard[] {
  const hazards: Hazard[] = [];
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.dormant || !enemy.hurts) continue;
    if (enemy.y > PLAYER_Y - 280 && enemy.y < PLAYER_Y + enemy.hh + 24) {
      hazards.push({ x: enemy.x, y: enemy.y, reach: enemy.hw + 30 });
    }
  }
  for (const bullet of state.bullets) {
    if (!bullet.alive || bullet.from !== "enemy") continue;
    if (bullet.y > PLAYER_Y - 280 && bullet.y < PLAYER_Y + 48) {
      hazards.push({ x: bullet.x, y: bullet.y, reach: Math.max(bullet.hw, bullet.radius) + 28 });
    }
  }
  return hazards;
}

function pickX(current: number, goal: number | null, hazards: Hazard[], min: number, max: number): number {
  const lo = Math.max(36, Math.min(min, max));
  const hi = Math.min(W - 36, Math.max(min, max));
  if (hi - lo < 12) return clamp(current, 36, W - 36);
  let bestX = clamp(current, lo, hi);
  let bestScore = -Infinity;
  for (let x = lo; x <= hi; x += 8) {
    let score = -Math.abs(x - current) * 0.12;
    if (goal != null) score -= Math.abs(x - goal) * 0.4;
    for (const hazard of hazards) {
      const gap = Math.abs(x - hazard.x) - hazard.reach;
      score += gap < 0 ? -900 : Math.min(gap, 80);
    }
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  return bestX;
}

function desiredX(state: RunState): number | null {
  const boss = state.enemies.find((enemy) => enemy.alive && !enemy.dormant && (enemy.kind === "boss" || enemy.kind === "miniboss"));
  if (boss?.pattern === "crab" && (boss.mode === "windup" || boss.mode === "swing")) {
    return boss.safeGap === 0 ? 74 : W - 74;
  }
  if (boss && (boss.mode === "windup" || boss.mode === "dash" || (boss.mode === "return" && boss.y > 400))) {
    return clamp(boss.x + (boss.x >= W / 2 ? -120 : 120), 100, W - 100);
  }
  if (boss) return boss.x;

  if (state.phase === "waves") {
    const crates = state.crates.filter((crate) => crate.alive && crate.y > 80 && crate.y < PLAYER_Y - 80);
    if (crates.length > 0) {
      const ranked = crates
        .filter((crate) => desire(crate.offer, state) > 0 && laneIsOpen(state, crate.x))
        .sort((a, b) => desire(b.offer, state) - desire(a.offer, state));
      if (ranked[0]) return ranked[0].x;
    }
  }

  return null;
}

function laneIsOpen(state: RunState, x: number): boolean {
  let blocking = 0;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.dormant || !enemy.hurts) continue;
    if (enemy.y < PLAYER_Y - 420 || enemy.y > PLAYER_Y + 10) continue;
    if (Math.abs(enemy.x - x) < enemy.hw + 34) blocking += 1;
  }
  return blocking < 2;
}

function desire(offer: RunState["crates"][number]["offer"], state: RunState): number {
  if (offer.type === "companion") return state.companion ? -1 : 72;
  if (offer.weaponId === state.weapon.id) return -1;
  const next = singleTargetDps(weaponById(offer.weaponId));
  if (next < singleTargetDps(state.weapon) + 4) return -1;
  return next;
}
