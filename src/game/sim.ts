import { archetypeById, destinationById, weaponById } from "./content";
import { buildSchedule } from "./generate";
import { circleHitsRect, clamp } from "./geometry";
import { mulberry32 } from "./rng";
import { multiplierFor } from "./score";
import {
  H,
  PLAYER_R,
  PLAYER_Y,
  W,
  type Archetype,
  type Bullet,
  type Crate,
  type Enemy,
  type FormatId,
  type Input,
  type Offer,
  type RunState,
  type Weapon,
} from "./types";

const MARGIN = 30;
/** Widest aim off straight ahead, in radians. Kept modest so the edges of the screen do not fling shots off the road. */
export const AIM_LIMIT = 0.68;

export function aimFromPointer(pointerX: number): number {
  const span = clamp((pointerX - W / 2) / (W / 2), -1, 1);
  return span * AIM_LIMIT;
}

export function pointerFromAim(angle: number): number {
  return W / 2 + clamp(angle / AIM_LIMIT, -1, 1) * (W / 2);
}

export function createRun(options: {
  seed: number;
  destination: string;
  format: FormatId;
  practice: boolean;
  coach: boolean;
  daily: boolean;
  day: string;
}): RunState {
  const destination = destinationById(options.destination);
  const rand = mulberry32(options.seed);
  const coach = options.coach && !options.daily && !options.practice;
  const schedule = buildSchedule(rand, options.destination, options.format, coach);
  return {
    seed: options.seed,
    destination: options.destination,
    format: options.format,
    practice: options.practice,
    daily: options.daily,
    day: options.day,
    status: "running",
    phase: "waves",
    time: 0,
    waveTime: 0,
    introT: 0,
    bossTimeLeft: null,
    playerX: W / 2,
    playerY: PLAYER_Y,
    aim: 0,
    lean: 0,
    hearts: 3,
    iframes: 0.45,
    weapon: weaponById("trail-pistol"),
    companion: false,
    fireCooldown: 0.2,
    windup: 0,
    muzzle: 0,
    swing: 0,
    buddyCooldown: 0.4,
    score: 0,
    parts: { fromKills: 0, fromBoss: 0, fromHearts: 0, bestChain: 0, kills: 0, bossTimeLeft: null },
    chain: 0,
    multiplier: 1,
    bullets: [],
    enemies: [],
    crates: [],
    floaters: [],
    rings: [],
    banner: destination.name,
    bannerSub: destination.region,
    bannerT: 1.35,
    shake: 0,
    events: schedule.events,
    eventIndex: 0,
    setpieces: schedule.setpieces,
    setpieceIndex: 0,
    nextId: 1,
    nextShot: 1,
    lossReason: null,
    winReason: null,
    claimed: [],
    offerLog: [],
    winLine: schedule.winLine,
    loseLine: schedule.loseLine,
    timeoutLine: schedule.timeoutLine,
    pings: [],
  };
}

export function step(state: RunState, dt: number, input: Input): RunState {
  let left = Math.min(Math.max(dt, 0), 8);
  while (left > 0 && state.status === "running") {
    const slice = Math.min(left, 1 / 60);
    tick(state, slice, input);
    left -= slice;
  }
  return state;
}

export function timerLabel(state: RunState): { text: string; urgent: boolean } {
  if (state.phase === "boss" && state.bossTimeLeft != null) {
    return { text: `Boss ${Math.ceil(state.bossTimeLeft)}`, urgent: state.bossTimeLeft < 8 };
  }
  return { text: "", urgent: false };
}

function tick(state: RunState, dt: number, input: Input) {
  state.time += dt;
  state.bannerT = Math.max(0, state.bannerT - dt);
  state.muzzle = Math.max(0, state.muzzle - dt);
  state.iframes = Math.max(0, state.iframes - dt);
  state.shake *= Math.pow(0.04, dt);
  if (state.shake < 0.15) state.shake = 0;
  for (const floater of state.floaters) {
    floater.life -= dt;
    floater.y -= 28 * dt;
  }
  state.floaters = state.floaters.filter((floater) => floater.life > 0).slice(-24);
  for (const ring of state.rings) ring.life -= dt;
  state.rings = state.rings.filter((ring) => ring.life > 0).slice(-16);

  state.playerX = W / 2;
  if (input.pointerX != null) {
    const target = aimFromPointer(clamp(input.pointerX, MARGIN, W - MARGIN));
    state.aim += (target - state.aim) * Math.min(1, dt * 8);
  } else if (input.left || input.right) {
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    state.aim = clamp(state.aim + direction * 1.5 * dt, -AIM_LIMIT, AIM_LIMIT);
  }
  state.lean = clamp(state.aim / AIM_LIMIT, -1, 1);

  if (state.phase === "waves") {
    state.waveTime += dt;
    spawnDue(state);
    const piece = state.setpieces[state.setpieceIndex];
    if (piece && state.waveTime >= piece.at) {
      beginSetpiece(state, piece);
    }
  } else if (state.phase === "intro") {
    state.introT -= dt;
    const boss = liveBoss(state);
    if (boss) {
      boss.y += (boss.stayY - boss.y) * Math.min(1, dt * 2.4);
    }
    if (state.introT <= 0) {
      state.phase = "boss";
      if (boss) {
        boss.dormant = false;
        boss.y = boss.stayY;
        const limit = state.practice ? Math.round(boss.limit * 1.4) : boss.limit;
        state.bossTimeLeft = limit;
        boss.cooldown = boss.pattern === "crab" ? 1.35 : boss.shootEvery;
      }
    }
  } else if (state.phase === "boss" && state.bossTimeLeft != null) {
    state.bossTimeLeft -= dt;
  }

  weapons(state, dt);
  for (const bullet of state.bullets) moveBullet(bullet, dt);
  for (const crate of state.crates) {
    crate.y += crate.vy * dt;
    if (crate.y > H + 50) crate.alive = false;
  }
  assignClosers(state);
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    enemy.age += dt;
    enemy.flash = Math.max(0, enemy.flash - dt);
    if (enemy.dormant) continue;
    moveEnemy(state, enemy, dt);
  }

  collide(state, dt);

  if (state.status === "running" && state.phase === "boss" && state.bossTimeLeft != null && state.bossTimeLeft <= 0) {
    const boss = liveBoss(state);
    if (boss?.final) {
      lose(state, state.timeoutLine);
    } else if (boss) {
      boss.alive = false;
      state.phase = "waves";
      state.bossTimeLeft = null;
      setBanner(state, "It leaves the lane.", "The clock ran out. You did not.", 1.35);
    }
  }

  state.bullets = state.bullets.filter((bullet) => bullet.alive && bullet.y > -120 && bullet.y < H + 140 && bullet.x > -80 && bullet.x < W + 80);
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
  state.crates = state.crates.filter((crate) => crate.alive);
  if (laneIsClear(state)) win(state);
}

function laneIsClear(state: RunState): boolean {
  return (
    state.status === "running" &&
    state.phase === "waves" &&
    state.setpieceIndex >= state.setpieces.length &&
    state.events.length > 0 &&
    state.eventIndex >= state.events.length &&
    state.enemies.length === 0 &&
    state.crates.length === 0 &&
    !state.bullets.some((bullet) => bullet.from === "enemy")
  );
}

function spawnDue(state: RunState) {
  const horizon = state.setpieces[state.setpieceIndex]?.at ?? Infinity;
  while (
    state.eventIndex < state.events.length &&
    state.events[state.eventIndex]!.t <= state.waveTime &&
    state.events[state.eventIndex]!.t < horizon - 0.04
  ) {
    const event = state.events[state.eventIndex]!;
    state.eventIndex += 1;
    if (event.type === "banner") {
      setBanner(state, event.title, event.sub, 1.7);
    } else if (event.type === "crate") {
      spawnCrate(state, event.offer, event.x, event.pair);
    } else {
      spawnFromArchetype(state, archetypeById(event.archetype), event.x, -40, "mob");
    }
  }
}

function beginSetpiece(state: RunState, piece: RunState["setpieces"][number]) {
  state.setpieceIndex += 1;
  state.phase = "intro";
  state.introT = piece.final ? 2.05 : 1.3;
  state.bossTimeLeft = null;
  setBanner(state, piece.title, piece.sub, state.introT);
  state.pings.push("boss");
  state.enemies = state.enemies.filter((enemy) => enemy.kind === "boss" || enemy.kind === "miniboss");
  state.crates = [];
  state.bullets = [];
  const boss = spawnFromArchetype(state, archetypeById(piece.archetype), W / 2, -90, piece.final ? "boss" : "miniboss");
  boss.dormant = true;
  boss.final = piece.final;
  boss.limit = piece.limit;
  boss.title = piece.title;
  boss.sub = piece.sub;
  boss.kind = piece.final ? "boss" : "miniboss";
}

function weapons(state: RunState, dt: number) {
  state.fireCooldown -= dt;
  if (state.windup > 0) {
    state.windup -= dt;
    state.swing = clamp(state.windup / Math.max(0.05, state.weapon.windup), 0, 1);
    if (state.windup <= 0) {
      state.swing = 0;
      const muzzle = shotOrigin(state, 34);
      fireWeapon(state, state.weapon, muzzle.x, muzzle.y);
      state.muzzle = 0.14;
      state.pings.push(state.weapon.projectile === "mallet" ? "mallet" : "shot");
    }
    return;
  }
  if (state.fireCooldown <= 0) {
    if (state.weapon.windup > 0) {
      state.windup = state.weapon.windup;
      state.swing = 1;
      state.fireCooldown = state.weapon.fireInterval;
    } else {
      const muzzle = shotOrigin(state, 34);
      fireWeapon(state, state.weapon, muzzle.x, muzzle.y);
      state.fireCooldown = state.weapon.fireInterval;
      state.muzzle = 0.07;
      state.pings.push("shot");
    }
  }
  if (state.companion) {
    state.buddyCooldown -= dt;
    if (state.buddyCooldown <= 0) {
      const buddy = weaponById("trail-pistol");
      const buddyMuzzle = shotOrigin(state, 18);
      fireWeapon(state, { ...buddy, pelletDamage: 8, color: "#7bdff2" }, buddyMuzzle.x + 36 * (state.aim >= 0 ? 1 : -1), buddyMuzzle.y);
      state.buddyCooldown = 0.24;
    }
  }
}

function shotOrigin(state: RunState, reach: number) {
  return {
    x: state.playerX + Math.sin(state.aim) * reach,
    y: state.playerY - Math.cos(state.aim) * reach,
  };
}

function fireWeapon(state: RunState, weapon: Weapon, x: number, y: number) {
  const shotId = state.nextShot;
  state.nextShot += 1;
  const pellets = weapon.pellets;
  for (let i = 0; i < pellets; i += 1) {
    const t = pellets === 1 ? 0 : (i / (pellets - 1)) * 2 - 1;
    const angle = state.aim + t * (weapon.spread / 2);
    const speed = weapon.projectileSpeed;
    const vx = Math.sin(angle) * speed;
    const vy = -Math.cos(angle) * speed;
    const wide = weapon.projectile === "train" || weapon.projectile === "horn" || weapon.projectile === "mallet";
    state.bullets.push({
      id: state.nextId++,
      x,
      y,
      vx,
      vy,
      damage: weapon.pelletDamage,
      pierce: weapon.pierce,
      splash: weapon.splash,
      splashDamage: weapon.splashDamage,
      radius: weapon.radius,
      kind: weapon.projectile,
      from: "player",
      color: weapon.color,
      shotId,
      alive: true,
      age: 0,
      hw: wide ? weapon.radius + 8 : weapon.radius,
      hh: weapon.projectile === "mallet" ? weapon.radius * 0.72 : weapon.radius,
    });
  }
}

function moveBullet(bullet: Bullet, dt: number) {
  bullet.age += dt;
  bullet.x += bullet.vx * dt;
  bullet.y += bullet.vy * dt;
  if (bullet.kind === "rock" || bullet.kind === "blob" || bullet.kind === "mallet") {
    if (bullet.from === "enemy" && bullet.age > (bullet.kind === "mallet" ? 0.22 : 4)) bullet.alive = false;
  }
}

function moveEnemy(state: RunState, enemy: Enemy, dt: number) {
  if (enemy.pattern === "boss") {
    tickAnchored(state, enemy, dt);
    return;
  }
  if (enemy.pattern === "crab") {
    tickCrab(state, enemy, dt);
    return;
  }
  if (enemy.pattern === "obstacle") {
    enemy.y += enemy.vy * dt;
    if (enemy.y > H + 40) enemy.alive = false;
    return;
  }
  // Keep closing on the player until the last moment, from either side.
  // A fixed lane left a safe column in the middle of the screen.
  closeOnPlayer(state, enemy, dt);
  if (enemy.pattern === "weave") {
    enemy.y += enemy.vy * dt;
    enemy.x = clamp(enemy.originX + Math.sin(enemy.age * 2.5) * 38, enemy.hw + 8, W - enemy.hw - 8);
  } else if (enemy.pattern === "elk") {
    enemy.y += enemy.vy * dt;
    enemy.x = clamp(enemy.originX + Math.sin(enemy.age * 1.35) * 26, enemy.hw + 8, W - enemy.hw - 8);
  } else if (enemy.pattern === "shooter") {
    enemy.y += enemy.vy * dt;
    enemy.cooldown -= dt;
    if (enemy.cooldown <= 0) {
      shootBlob(state, enemy);
      enemy.cooldown = enemy.shootEvery;
    }
  } else {
    enemy.y += enemy.vy * dt;
  }
  if (enemy.y > H + 70) enemy.alive = false;
}

function tickAnchored(state: RunState, enemy: Enemy, dt: number) {
  if (enemy.mode === "strafe") {
    enemy.x = clamp(W / 2 + Math.sin(enemy.age * 0.7) * 62, 150, W - 150);
    enemy.y += (enemy.stayY - enemy.y) * Math.min(1, dt * 3);
    enemy.modeT += dt;
    enemy.cooldown -= dt;
    if (enemy.shootEvery > 0 && enemy.cooldown <= 0) {
      shootRocks(state, enemy);
      enemy.cooldown = enemy.shootEvery;
    }
    maybeSummon(state, enemy);
    if (enemy.canDash && enemy.modeT > 3.4) {
      enemy.mode = "windup";
      enemy.modeT = 0.82;
    }
    return;
  }
  if (enemy.mode === "windup") {
    enemy.modeT -= dt;
    if (enemy.modeT <= 0) enemy.mode = "dash";
    return;
  }
  if (enemy.mode === "dash") {
    enemy.y += 860 * dt;
    if (enemy.y >= state.playerY - enemy.hh * 0.2) enemy.mode = "return";
    return;
  }
  enemy.y -= 460 * dt;
  if (enemy.y <= enemy.stayY) {
    enemy.y = enemy.stayY;
    enemy.mode = "strafe";
    enemy.modeT = 0;
  }
}

function tickCrab(state: RunState, enemy: Enemy, dt: number) {
  enemy.x = clamp(W / 2 + Math.sin(enemy.age * 0.8) * 90, enemy.hw + 8, W - enemy.hw - 8);
  enemy.y += (enemy.stayY - enemy.y) * Math.min(1, dt * 3);
  maybeSummon(state, enemy);
  enemy.cooldown -= dt;
  if (enemy.mode === "swing") {
    enemy.modeT -= dt;
    if (enemy.modeT <= 0) {
      slam(state, enemy);
      enemy.mode = "strafe";
      enemy.cooldown = 2.15;
    }
    return;
  }
  if (enemy.cooldown <= 0) {
    enemy.safeGap = enemy.safeGap === 0 ? 1 : 0;
    enemy.mode = "swing";
    enemy.modeT = 0.62;
  }
}

function maybeSummon(state: RunState, enemy: Enemy) {
  if (!enemy.summon || enemy.summonEvery <= 0) return;
  const due = Math.floor(enemy.age / enemy.summonEvery);
  if (due <= enemy.summons) return;
  enemy.summons = due;
  if (state.enemies.filter((other) => other.alive && other.kind === "mob").length >= 28) return;
  const archetype = archetypeById(enemy.summon);
  const x = due % 2 === 0 ? archetype.hw + 16 : W - archetype.hw - 16;
  spawnFromArchetype(state, archetype, x, enemy.y + enemy.hh + 8, "mob");
}

function shootRocks(state: RunState, enemy: Enemy) {
  if (enemy.mode !== "strafe") return;
  const speed = state.practice ? 250 : 280;
  for (const x of [46, W - 46]) {
    spawnEnemyShot(state, x, enemy.y + 10, 0, speed, "rock", "#d7d3cb", 11);
  }
}

function assignClosers(state: RunState) {
  const pending = state.enemies.filter(
    (enemy) => enemy.alive && enemy.safeGap === 0 && enemy.kind !== "obstacle" && enemy.pattern !== "boss" && enemy.pattern !== "crab",
  );
  for (const enemy of pending) {
    if (enemy.safeGap !== 0) continue;
    const rank = pending.filter((other) => Math.abs(other.y - enemy.y) < 36);
    const fragile = rank.filter((other) => other.pattern === "drift" && other.maxHp <= 12);
    if (fragile.length === 0) {
      for (const other of rank) other.safeGap = 2;
      continue;
    }
    const pool = fragile;
    pool.sort((a, b) => Math.abs(a.originX - state.playerX) - Math.abs(b.originX - state.playerX) || a.id - b.id);
    const lead = pool[0];
    for (const other of rank) other.safeGap = other === lead ? 1 : 2;
  }
}

function closeOnPlayer(state: RunState, enemy: Enemy, dt: number) {
  const lead = state.playerY - enemy.y;
  // Keep steering until they are almost on the character. Stopping earlier
  // left them close enough to touch and too far aside for a straight shot.
  if (lead < 48) return;
  const dx = state.playerX - enemy.originX;
  const commit = enemy.safeGap === 1;
  const sway = enemy.pattern === "weave" ? 42 : enemy.pattern === "elk" ? 30 : 0;
  const minGap = enemy.hw + PLAYER_R + 20 + sway;
  // One body from the rank walks onto the character, from whichever side it started.
  // The others close in on their own side and stop short of the straight shot.
  let slot = state.playerX;
  if (!commit) {
    if (Math.abs(dx) <= minGap) return;
    slot = state.playerX - Math.sign(dx || 1) * minGap;
  }
  const next = enemy.originX + (slot - enemy.originX) * Math.min(1, dt * 1.5);
  enemy.originX = clamp(next, enemy.hw + 8, W - enemy.hw - 8);
  if (enemy.pattern === "drift" || enemy.pattern === "shooter") enemy.x = enemy.originX;
}

function shootBlob(state: RunState, enemy: Enemy) {
  const speed = state.practice ? 108 : 124;
  spawnEnemyShot(state, enemy.x, enemy.y + enemy.hh, 0, speed, "blob", "#6f4e37", 10);
}

function slam(state: RunState, enemy: Enemy) {
  const safeLeft = enemy.safeGap === 0;
  spawnEnemyShot(
    state,
    safeLeft ? 268 : 122,
    state.playerY,
    0,
    0,
    "mallet",
    "#e85d4c",
    16,
    128,
    26,
  );
  state.pings.push("mallet");
}

function spawnEnemyShot(
  state: RunState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  kind: Bullet["kind"],
  color: string,
  radius: number,
  hw = radius,
  hh = radius,
) {
  state.bullets.push({
    id: state.nextId++,
    x,
    y,
    vx,
    vy,
    damage: 1,
    pierce: 1,
    splash: 0,
    splashDamage: 0,
    radius,
    kind,
    from: "enemy",
    color,
    shotId: 0,
    alive: true,
    age: 0,
    hw,
    hh,
  });
}

function collide(state: RunState, dt: number) {
  for (const bullet of state.bullets) {
    if (!bullet.alive || bullet.from !== "player") continue;
    for (const crate of state.crates) {
      if (!crate.alive || !bullet.alive) continue;
      if (!hits(bullet, crate.x, crate.y, crate.hw, crate.hh, dt)) continue;
      if (crate.counted.includes(bullet.shotId)) continue;
      crate.counted.push(bullet.shotId);
      crate.hitsLeft -= 1;
      bullet.pierce -= 1;
      if (bullet.pierce <= 0) bullet.alive = false;
      if (crate.hitsLeft <= 0) claimCrate(state, crate);
    }
  }

  for (const bullet of state.bullets) {
    if (!bullet.alive || bullet.from !== "player") continue;
    for (const enemy of state.enemies) {
      if (!bullet.alive || !enemy.alive || !enemy.shootable || enemy.dormant) continue;
      if (Math.abs(enemy.y - bullet.y) > enemy.hh + 36) continue;
      if (Math.abs(enemy.x - bullet.x) > enemy.hw + 36) continue;
      if (!hits(bullet, enemy.x, enemy.y, enemy.hw, enemy.hh, dt)) continue;
      damageEnemy(state, enemy, bullet.damage);
      if (bullet.splash > 0) splash(state, bullet, enemy.id);
      bullet.pierce -= 1;
      if (bullet.pierce <= 0) {
        bullet.alive = false;
        break;
      }
    }
  }

  if (state.iframes <= 0 && state.status === "running") {
    for (const enemy of state.enemies) {
      if (!enemy.alive || enemy.dormant || !enemy.hurts) continue;
      if (enemy.y < state.playerY - 90 || enemy.y > state.playerY + 48) continue;
      if (circleHitsRect(state.playerX, state.playerY, PLAYER_R, enemy.x, enemy.y, enemy.hw, enemy.hh)) {
        hurt(state, enemy.archetype);
        break;
      }
    }
  }
  if (state.iframes <= 0 && state.status === "running") {
    for (const bullet of state.bullets) {
      if (!bullet.alive || bullet.from !== "enemy") continue;
      if (circleHitsRect(state.playerX, state.playerY, PLAYER_R, bullet.x, bullet.y, Math.max(bullet.hw, bullet.radius), Math.max(bullet.hh, bullet.radius))) {
        bullet.alive = false;
        hurt(state, bullet.kind);
        break;
      }
    }
  }
}

function hits(bullet: Bullet, x: number, y: number, hw: number, hh: number, dt: number): boolean {
  const radius = Math.max(bullet.radius, bullet.hw * 0.65);
  if (circleHitsRect(bullet.x, bullet.y, radius, x, y, hw, hh)) return true;
  return circleHitsRect(bullet.x - bullet.vx * dt * 0.5, bullet.y - bullet.vy * dt * 0.5, radius, x, y, hw, hh);
}

function damageEnemy(state: RunState, enemy: Enemy, amount: number) {
  if (!enemy.alive || enemy.dormant || !enemy.shootable) return;
  enemy.hp -= amount;
  enemy.flash = 0.08;
  if (enemy.maxHp >= 80 && enemy.sprite !== "tires") {
    floater(state, enemy.x, enemy.y - enemy.hh * 0.4, String(Math.round(amount)), "bad");
  }
  if (enemy.hp <= 0) killEnemy(state, enemy);
}

function splash(state: RunState, bullet: Bullet, ignoreId: number) {
  state.rings.push({ id: state.nextId++, x: bullet.x, y: bullet.y, r: bullet.splash, life: 0.22, color: bullet.color });
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.id === ignoreId || !enemy.shootable || enemy.dormant) continue;
    const dx = enemy.x - bullet.x;
    const dy = enemy.y - bullet.y;
    if (dx * dx + dy * dy <= bullet.splash * bullet.splash) damageEnemy(state, enemy, bullet.splashDamage);
  }
}

function killEnemy(state: RunState, enemy: Enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  state.chain += 1;
  state.multiplier = multiplierFor(state.chain);
  state.parts.bestChain = Math.max(state.parts.bestChain, state.chain);
  const gained = Math.round(enemy.points * state.multiplier);
  state.score += gained;
  state.parts.fromKills += gained;
  state.parts.kills += 1;
  if (enemy.kind !== "mob" || enemy.points >= 80) {
    floater(state, enemy.x, enemy.y, `+${gained}`, state.multiplier > 1 ? "good" : "score");
  }
  if (enemy.kind === "boss" || enemy.kind === "miniboss") {
    if (enemy.final) win(state);
    else {
      state.phase = "waves";
      state.bossTimeLeft = null;
      setBanner(state, "Lane's clear.", "Keep the line.", 1.15);
    }
  }
}

function claimCrate(state: RunState, crate: Crate) {
  if (!crate.alive) return;
  crate.alive = false;
  const offer = crate.offer;
  if (offer.type === "companion") {
    if (!state.companion) {
      state.companion = true;
      state.claimed.push("Lane buddy");
      floater(state, crate.x, crate.y, "Buddy", "good");
      state.pings.push("upgrade");
    }
  } else if (offer.weaponId !== state.weapon.id) {
    state.weapon = weaponById(offer.weaponId);
    state.fireCooldown = 0.12;
    state.windup = 0;
    state.claimed.push(state.weapon.name);
    floater(state, crate.x, crate.y, state.weapon.name, "good");
    state.pings.push("upgrade");
  }
  for (const other of state.crates) {
    if (other.alive && other.pair !== 0 && other.pair === crate.pair) other.vy = 820;
  }
}

function hurt(state: RunState, source = "hit") {
  if (state.status !== "running" || state.iframes > 0) return;
  if (process.env.DEBUG_HURT) console.log("hurt", state.time.toFixed(2), source, "x", state.playerX.toFixed(0), state.phase);
  state.hearts -= 1;
  state.chain = 0;
  state.multiplier = 1;
  state.iframes = 1.15;
  state.shake = 8;
  state.pings.push("hurt");
  floater(state, state.playerX, state.playerY - 40, "Hit", "bad");
  if (state.hearts <= 0) lose(state, state.loseLine);
}

function win(state: RunState) {
  if (state.status !== "running") return;
  const timeBonus = Math.ceil(Math.max(0, state.bossTimeLeft ?? 0)) * 80;
  const heartBonus = state.hearts * 750;
  state.parts.fromBoss += timeBonus;
  state.parts.fromHearts += heartBonus;
  state.parts.bossTimeLeft = state.bossTimeLeft;
  state.score += timeBonus + heartBonus;
  state.status = "won";
  state.winReason = state.winLine;
  state.pings.push("win");
  setBanner(state, "Lane held", state.winLine, 2);
}

function lose(state: RunState, line: string) {
  if (state.status !== "running") return;
  state.status = "lost";
  state.lossReason = line;
  state.pings.push("lose");
  setBanner(state, "Lane lost", line, 2);
}

function spawnCrate(state: RunState, offer: Offer, x: number, pair: number) {
  const hits = offer.type === "weapon" ? weaponById(offer.weaponId).claimHits : 6;
  state.offerLog.push(offer.type === "companion" ? "companion" : offer.weaponId);
  state.crates.push({
    id: state.nextId++,
    x,
    y: -28,
    vy: 168,
    hw: 28,
    hh: 24,
    offer,
    hitsLeft: hits,
    hitsNeeded: hits,
    pair,
    counted: [],
    alive: true,
  });
}

function spawnFromArchetype(state: RunState, archetype: Archetype, x: number, y: number, kind: Enemy["kind"]): Enemy {
  const practiceHp = state.practice ? (archetype.kind === "boss" || kind !== "mob" ? 0.68 : 0.75) : 1;
  const hp = Math.max(1, Math.round(archetype.hp * (archetype.shootable ? practiceHp : 1)));
  const enemy: Enemy = {
    id: state.nextId++,
    archetype: archetype.id,
    name: archetype.name,
    sprite: archetype.sprite,
    x,
    y,
    hw: archetype.kind === "mob" ? Math.max(10, archetype.hw - 4) : archetype.hw,
    hh: archetype.hh,
    hp,
    maxHp: hp,
    vy: archetype.vy * (state.practice ? 0.86 : 1),
    vx: 0,
    originX: x,
    points: archetype.points,
    pattern: archetype.pattern,
    shootable: archetype.shootable,
    hurts: archetype.hurts,
    kind: archetype.kind === "obstacle" ? "obstacle" : kind,
    age: 0,
    flash: 0,
    dormant: false,
    shootEvery: archetype.shootEvery,
    canDash: archetype.canDash,
    summon: archetype.summon,
    summonEvery: archetype.summonEvery,
    stayY: archetype.stayY,
    cooldown: archetype.pattern === "shooter" ? 0.8 : 0.4,
    mode: "strafe",
    modeT: 0,
    safeGap: 0,
    final: false,
    limit: 30,
    title: "",
    sub: "",
    summons: 0,
    alive: true,
  };
  state.enemies.push(enemy);
  return enemy;
}

function liveBoss(state: RunState): Enemy | undefined {
  return state.enemies.find((enemy) => enemy.alive && (enemy.kind === "boss" || enemy.kind === "miniboss"));
}

function setBanner(state: RunState, title: string, sub: string, time: number) {
  state.banner = title;
  state.bannerSub = sub;
  state.bannerT = time;
}

function floater(state: RunState, x: number, y: number, text: string, kind: RunState["floaters"][number]["kind"]) {
  state.floaters.push({ id: state.nextId++, x, y, text, life: 0.7, kind });
}
