export const W = 390;
export const H = 844;
export const PLAYER_Y = 742;
export const PLAYER_R = 16;

export type FormatId = "push" | "gauntlet";
export type Bucket = "free" | "daily";
export type Phase = "waves" | "intro" | "boss";
export type RunStatus = "running" | "won" | "lost";
export type Ping = "shot" | "hurt" | "upgrade" | "boss" | "win" | "lose" | "mallet";

export type ProjectileKind =
  | "bolt"
  | "pellet"
  | "train"
  | "pot"
  | "mallet"
  | "horn"
  | "rock"
  | "blob";

export type Weapon = {
  id: string;
  name: string;
  pellets: number;
  pelletDamage: number;
  /** Total fan width in radians. */
  spread: number;
  fireInterval: number;
  projectileSpeed: number;
  pierce: number;
  splash: number;
  splashDamage: number;
  /** Seconds of windup before the shot exists. */
  windup: number;
  radius: number;
  claimHits: number;
  color: string;
  projectile: ProjectileKind;
};

export type Offer =
  | { type: "weapon"; weaponId: string }
  | { type: "companion" };

export type Archetype = {
  id: string;
  name: string;
  sprite: string;
  hw: number;
  hh: number;
  hp: number;
  vy: number;
  points: number;
  pattern: "drift" | "weave" | "elk" | "shooter" | "boss" | "crab" | "obstacle";
  shootable: boolean;
  hurts: boolean;
  kind: "mob" | "obstacle" | "boss" | "miniboss";
  shootEvery: number;
  canDash: boolean;
  summon: string | null;
  summonEvery: number;
  stayY: number;
};

export type SpawnEvent =
  | { t: number; type: "mob"; archetype: string; x: number }
  | { t: number; type: "crate"; offer: Offer; x: number; pair: number }
  | { t: number; type: "banner"; title: string; sub: string };

export type Setpiece = {
  at: number;
  archetype: string;
  final: boolean;
  limit: number;
  title: string;
  sub: string;
};

export type Schedule = {
  events: SpawnEvent[];
  setpieces: Setpiece[];
  winLine: string;
  loseLine: string;
  timeoutLine: string;
};

export type Bullet = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  splash: number;
  splashDamage: number;
  radius: number;
  kind: ProjectileKind;
  from: "player" | "enemy";
  color: string;
  shotId: number;
  alive: boolean;
  age: number;
  hw: number;
  hh: number;
};

export type Enemy = {
  id: number;
  archetype: string;
  name: string;
  sprite: string;
  x: number;
  y: number;
  hw: number;
  hh: number;
  hp: number;
  maxHp: number;
  vy: number;
  vx: number;
  originX: number;
  points: number;
  pattern: Archetype["pattern"];
  shootable: boolean;
  hurts: boolean;
  kind: Archetype["kind"];
  age: number;
  flash: number;
  dormant: boolean;
  shootEvery: number;
  canDash: boolean;
  summon: string | null;
  summonEvery: number;
  stayY: number;
  cooldown: number;
  mode: "strafe" | "windup" | "dash" | "return" | "swing";
  modeT: number;
  safeGap: number;
  final: boolean;
  limit: number;
  title: string;
  sub: string;
  summons: number;
  alive: boolean;
};

export type Crate = {
  id: number;
  x: number;
  y: number;
  vy: number;
  hw: number;
  hh: number;
  offer: Offer;
  hitsLeft: number;
  hitsNeeded: number;
  pair: number;
  counted: number[];
  alive: boolean;
};

export type Floater = {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
  kind: "score" | "good" | "bad";
};

export type Ring = {
  id: number;
  x: number;
  y: number;
  r: number;
  life: number;
  color: string;
};

export type ScoreParts = {
  fromKills: number;
  fromBoss: number;
  fromHearts: number;
  bestChain: number;
  kills: number;
  bossTimeLeft: number | null;
};

export type Input = {
  pointerX: number | null;
  left: boolean;
  right: boolean;
};

export type RunState = {
  seed: number;
  destination: string;
  format: FormatId;
  practice: boolean;
  daily: boolean;
  day: string;
  status: RunStatus;
  phase: Phase;
  time: number;
  waveTime: number;
  introT: number;
  bossTimeLeft: number | null;
  playerX: number;
  playerY: number;
  /** Radians off straight up. Positive aims to the right. */
  aim: number;
  lean: number;
  hearts: number;
  iframes: number;
  weapon: Weapon;
  companion: boolean;
  fireCooldown: number;
  windup: number;
  muzzle: number;
  swing: number;
  buddyCooldown: number;
  score: number;
  parts: ScoreParts;
  chain: number;
  multiplier: number;
  bullets: Bullet[];
  enemies: Enemy[];
  crates: Crate[];
  floaters: Floater[];
  rings: Ring[];
  banner: string | null;
  bannerSub: string | null;
  bannerT: number;
  shake: number;
  events: SpawnEvent[];
  eventIndex: number;
  setpieces: Setpiece[];
  setpieceIndex: number;
  nextId: number;
  nextShot: number;
  lossReason: string | null;
  winReason: string | null;
  claimed: string[];
  offerLog: string[];
  winLine: string;
  loseLine: string;
  timeoutLine: string;
  pings: Ping[];
};
