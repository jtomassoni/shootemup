import type { Archetype, FormatId, Offer, Weapon } from "./types";

export const GAME_TITLE = "Hold the Lane";
export const GAME_TAGLINE = "One finger. The lane is not yours yet.";
export const GAME_DESCRIPTION =
  "A short portrait shooter. Hold the center, aim with one thumb, and grab the ridiculous weapon before it gets away.";

export const FORMATS: { id: FormatId; name: string; blurb: string }[] = [
  { id: "push", name: "Push", blurb: "About ninety seconds of the lane." },
  { id: "gauntlet", name: "Gauntlet", blurb: "About ninety seconds of the lane." },
];

export type Avatar = {
  id: string;
  name: string;
  blurb: string;
  shirt: string;
  skin: string;
  accent: string;
  prop: "cap" | "glasses" | "helmet" | "conductor" | "toque" | "pilot" | "ranger" | "beanie" | "bike" | "apron";
};

export const AVATARS: Avatar[] = [
  { id: "nurse", name: "Nurse", blurb: "Night-shift posture.", shirt: "#2a9d8f", skin: "#f0c7a4", accent: "#e85d4c", prop: "cap" },
  { id: "engineer", name: "Engineer", blurb: "Ships from the couch.", shirt: "#31455b", skin: "#e8b894", accent: "#7bdff2", prop: "glasses" },
  { id: "driver", name: "Driver", blurb: "Late on the brakes.", shirt: "#d62828", skin: "#f3d2b5", accent: "#fcbf49", prop: "helmet" },
  { id: "conductor", name: "Conductor", blurb: "All aboard, sideways.", shirt: "#1d3557", skin: "#d9a57a", accent: "#f4d35e", prop: "conductor" },
  { id: "chef", name: "Chef", blurb: "Brought a pot.", shirt: "#f7f3ea", skin: "#e0ac7f", accent: "#e76f51", prop: "toque" },
  { id: "pilot", name: "Pilot", blurb: "Used to a longer runway.", shirt: "#264653", skin: "#f1c6a6", accent: "#e9c46a", prop: "pilot" },
  { id: "ranger", name: "Ranger", blurb: "Knows the switchbacks.", shirt: "#606c38", skin: "#f0c7a4", accent: "#dda15e", prop: "ranger" },
  { id: "crabber", name: "Crabber", blurb: "Keeps a mallet handy.", shirt: "#bc6c25", skin: "#c6865a", accent: "#f4a261", prop: "beanie" },
  { id: "cyclist", name: "Cyclist", blurb: "Holds a line.", shirt: "#0077b6", skin: "#f3d2b5", accent: "#90e0ef", prop: "bike" },
  { id: "barista", name: "Barista", blurb: "Pulls shots. Literally.", shirt: "#6f4e37", skin: "#e8b894", accent: "#d4a373", prop: "apron" },
];

export const WEAPONS: Record<string, Weapon> = {
  "trail-pistol": {
    id: "trail-pistol",
    name: "Trail pistol",
    pellets: 1,
    pelletDamage: 10,
    spread: 0,
    fireInterval: 0.18,
    projectileSpeed: 820,
    pierce: 1,
    splash: 0,
    splashDamage: 0,
    windup: 0,
    radius: 5,
    claimHits: 6,
    color: "#f4d35e",
    projectile: "bolt",
  },
  espresso: {
    id: "espresso",
    name: "Espresso",
    pellets: 1,
    pelletDamage: 10,
    spread: 0,
    fireInterval: 0.09,
    projectileSpeed: 900,
    pierce: 1,
    splash: 0,
    splashDamage: 0,
    windup: 0,
    radius: 4,
    claimHits: 6,
    color: "#6f4e37",
    projectile: "bolt",
  },
  "hail-spread": {
    id: "hail-spread",
    name: "Hail spread",
    pellets: 5,
    pelletDamage: 11,
    spread: 0.42,
    fireInterval: 0.52,
    projectileSpeed: 760,
    pierce: 1,
    splash: 0,
    splashDamage: 0,
    windup: 0,
    radius: 5,
    claimHits: 8,
    color: "#d7f3ff",
    projectile: "pellet",
  },
  "cog-train": {
    id: "cog-train",
    name: "Cog train",
    pellets: 1,
    pelletDamage: 36,
    spread: 0,
    fireInterval: 0.5,
    projectileSpeed: 540,
    pierce: 8,
    splash: 0,
    splashDamage: 0,
    windup: 0,
    radius: 11,
    claimHits: 7,
    color: "#e76f51",
    projectile: "train",
  },
  "pueblo-pot": {
    id: "pueblo-pot",
    name: "Pueblo pot",
    pellets: 1,
    pelletDamage: 28,
    spread: 0,
    fireInterval: 0.48,
    projectileSpeed: 640,
    pierce: 1,
    splash: 78,
    splashDamage: 16,
    windup: 0,
    radius: 8,
    claimHits: 7,
    color: "#2a9d8f",
    projectile: "pot",
  },
  "crab-mallet": {
    id: "crab-mallet",
    name: "Crab mallet",
    pellets: 1,
    pelletDamage: 76,
    spread: 0,
    fireInterval: 0.92,
    projectileSpeed: 340,
    pierce: 3,
    splash: 36,
    splashDamage: 10,
    windup: 0.28,
    radius: 26,
    claimHits: 9,
    color: "#e85d4c",
    projectile: "mallet",
  },
  "bay-spice": {
    id: "bay-spice",
    name: "Bay spice",
    pellets: 6,
    pelletDamage: 8,
    spread: 0.55,
    fireInterval: 0.58,
    projectileSpeed: 700,
    pierce: 1,
    splash: 0,
    splashDamage: 0,
    windup: 0,
    radius: 5,
    claimHits: 8,
    color: "#c1121f",
    projectile: "pellet",
  },
  "ferry-horn": {
    id: "ferry-horn",
    name: "Ferry horn",
    pellets: 1,
    pelletDamage: 30,
    spread: 0,
    fireInterval: 0.46,
    projectileSpeed: 680,
    pierce: 6,
    splash: 0,
    splashDamage: 0,
    windup: 0,
    radius: 10,
    claimHits: 7,
    color: "#f4a261",
    projectile: "horn",
  },
};

export function weaponById(id: string): Weapon {
  const weapon = WEAPONS[id];
  if (!weapon) throw new Error(`Unknown weapon ${id}`);
  return weapon;
}

export function volleyDamage(weapon: Weapon): number {
  return weapon.pellets * weapon.pelletDamage + weapon.splashDamage;
}

export function singleTargetDps(weapon: Weapon): number {
  const perShot = weapon.pelletDamage + weapon.splashDamage * 0.25;
  return perShot / weapon.fireInterval;
}

export const ARCHETYPES: Record<string, Archetype> = {
  "kid-goat": mob("kid-goat", "Shambler", "shambler", 22, 20, 30, 168, 100, "weave"),
  hail: mob("hail", "Hail", "hail", 12, 12, 14, 210, 80, "drift"),
  driver: mob("driver", "Lane driver", "driver", 26, 18, 42, 176, 140, "drift"),
  elk: mob("elk", "Brute", "brute", 34, 26, 96, 150, 220, "elk"),
  "espresso-cart": shooter("espresso-cart", "Reacher", "reacher", 28, 24, 70, 150, 180, 1.7),
  "train-car": mob("train-car", "Cog car", "train", 70, 24, 130, 140, 260, "drift"),
  luggage: obstacle("luggage", "Loose luggage", "luggage", 24, 18, 128),
  "pass-goat": boss("pass-goat", "Pass brute", "brute", 52, 46, 980, 210, 2000, "boss", 1.35, true, "kid-goat", 4.8),
  "hail-ram": boss("hail-ram", "Hail brute", "brute", 40, 34, 420, 200, 700, "boss", 1.45, false, "hail", 3.4),
  "toll-elk": boss("toll-elk", "Toll brute", "brute", 46, 36, 520, 230, 800, "boss", 0, true, null, 0),
  "blue-crab": mob("blue-crab", "Crawler", "crawler", 24, 18, 34, 160, 110, "weave"),
  seagull: shooter("seagull", "Reacher", "reacher", 22, 16, 36, 172, 120, 1.55),
  honk: mob("honk", "Harbor traffic", "car", 30, 18, 48, 198, 150, "drift"),
  skiff: mob("skiff", "Skiff", "skiff", 64, 22, 120, 142, 240, "drift"),
  "spice-shaker": shooter("spice-shaker", "Reacher", "reacher", 20, 26, 64, 154, 170, 1.45),
  pothole: obstacle("pothole", "Pothole", "pothole", 32, 16, 120),
  "mallet-crab": boss("mallet-crab", "Harbor brute", "brute", 58, 42, 1040, 200, 2000, "crab", 1.35, false, "blue-crab", 4.4),
  "bridge-gull": boss("bridge-gull", "Bridge reacher", "reacher", 36, 28, 420, 190, 650, "boss", 0.66, false, "seagull", 3.4),
  "pothole-king": boss("pothole-king", "Pothole brute", "brute", 48, 28, 500, 150, 750, "crab", 0, false, "pothole", 0),
  "herd-goat": mob("herd-goat", "Shambler", "shambler", 13, 12, 10, 156, 26, "drift"),
  "herd-hare": mob("herd-hare", "Crawler", "crawler", 12, 11, 8, 156, 22, "drift"),
  "herd-lamb": mob("herd-lamb", "Shambler", "shambler", 13, 12, 10, 156, 24, "drift"),
  "herd-boar": mob("herd-boar", "Brute", "brute", 15, 13, 16, 156, 36, "drift"),
  "herd-gull": mob("herd-gull", "Reacher", "reacher", 13, 11, 8, 156, 22, "drift"),
  "herd-crab": mob("herd-crab", "Crawler", "crawler", 13, 12, 12, 156, 28, "drift"),
  tires: barrier("tires", "Tire stack", "tires", 26, 24, 64, 148, 80),
};

function mob(
  id: string,
  name: string,
  sprite: string,
  hw: number,
  hh: number,
  hp: number,
  vy: number,
  points: number,
  pattern: Archetype["pattern"],
): Archetype {
  return {
    id, name, sprite, hw, hh, hp, vy, points, pattern,
    shootable: true, hurts: true, kind: "mob",
    shootEvery: 0, canDash: false, summon: null, summonEvery: 0, stayY: 180,
  };
}

function shooter(
  id: string,
  name: string,
  sprite: string,
  hw: number,
  hh: number,
  hp: number,
  vy: number,
  points: number,
  shootEvery: number,
): Archetype {
  return {
    ...mob(id, name, sprite, hw, hh, hp, vy, points, "shooter"),
    shootEvery,
  };
}

function obstacle(id: string, name: string, sprite: string, hw: number, hh: number, vy: number): Archetype {
  return barrier(id, name, sprite, hw, hh, 1, vy, 0);
}

function barrier(
  id: string,
  name: string,
  sprite: string,
  hw: number,
  hh: number,
  hp: number,
  vy: number,
  points: number,
): Archetype {
  return {
    id, name, sprite, hw, hh, hp, vy, points, pattern: "obstacle",
    shootable: hp > 1, hurts: true, kind: "obstacle",
    shootEvery: 0, canDash: false, summon: null, summonEvery: 0, stayY: 180,
  };
}

function boss(
  id: string,
  name: string,
  sprite: string,
  hw: number,
  hh: number,
  hp: number,
  stayY: number,
  points: number,
  pattern: "boss" | "crab",
  shootEvery: number,
  canDash: boolean,
  summon: string | null,
  summonEvery: number,
): Archetype {
  return {
    id, name, sprite, hw, hh, hp, vy: 80, points, pattern,
    shootable: true, hurts: true, kind: "boss",
    shootEvery, canDash, summon, summonEvery, stayY,
  };
}

export function archetypeById(id: string): Archetype {
  const found = ARCHETYPES[id];
  if (!found) throw new Error(`Unknown archetype ${id}`);
  return found;
}

export type Destination = {
  id: string;
  name: string;
  region: string;
  blurb: string;
  requires: string | null;
  playable: boolean;
  travel: boolean;
  sky: [string, string];
  ink: string;
  accent: string;
  road: string;
  early: string[];
  mid: string[];
  late: string[];
  wide: string[];
  fast: string[];
  obstacle: string;
  /** One-shot bodies that fill the lane. The center stays open under the shooter. */
  fodder: string[];
  pairs: [Offer, Offer][];
  coachOffer: Offer;
  boss: string;
  minis: string[];
  bossTitle: string;
  bossSub: string;
  miniTitles: { title: string; sub: string }[];
  win: string[];
  lose: string[];
  timeout: string[];
  nextBlurb: string;
};

const coloradoPairs: [Offer, Offer][] = [
  [weapon("espresso"), weapon("hail-spread")],
  [weapon("cog-train"), weapon("pueblo-pot")],
  [weapon("hail-spread"), weapon("cog-train")],
  [weapon("espresso"), weapon("pueblo-pot")],
  [companion(), weapon("hail-spread")],
  [companion(), weapon("cog-train")],
];

const marylandPairs: [Offer, Offer][] = [
  [weapon("crab-mallet"), weapon("bay-spice")],
  [weapon("ferry-horn"), weapon("crab-mallet")],
  [weapon("bay-spice"), weapon("ferry-horn")],
  [companion(), weapon("crab-mallet")],
  [companion(), weapon("bay-spice")],
  [weapon("crab-mallet"), weapon("ferry-horn")],
];

function weapon(weaponId: string): Offer {
  return { type: "weapon", weaponId };
}

function companion(): Offer {
  return { type: "companion" };
}

export const DESTINATIONS: Destination[] = [
  {
    id: "colorado",
    name: "Colorado",
    region: "The pass",
    blurb: "Zombies on the road. Shoot the stacks, then take the bigger gun.",
    requires: null,
    playable: true,
    travel: false,
    sky: ["#8fd3ff", "#e7f7ff"],
    ink: "#1c3144",
    accent: "#e76f51",
    road: "#3d4c5c",
    early: ["kid-goat", "hail", "driver"],
    mid: ["kid-goat", "driver", "espresso-cart", "elk", "hail"],
    late: ["elk", "train-car", "espresso-cart", "driver"],
    wide: ["train-car"],
    fast: ["hail"],
    obstacle: "tires",
    fodder: ["herd-goat", "herd-hare", "herd-lamb", "herd-boar"],
    pairs: coloradoPairs,
    coachOffer: weapon("espresso"),
    boss: "pass-goat",
    minis: ["hail-ram", "toll-elk"],
    bossTitle: "THE PASS BRUTE",
    bossSub: "It has the right of way.",
    miniTitles: [
      { title: "HAIL BRUTE", sub: "The weather brought friends." },
      { title: "TOLL BRUTE", sub: "It wants what you are carrying." },
    ],
    win: ["The pass is open.", "They stop coming. For now."],
    lose: ["The horde keeps the lane.", "You merged into them."],
    timeout: ["Their clock, not yours.", "The pass closes. They are still in it."],
    nextBlurb: "Maryland is open. Harbor traffic, and whatever came off the boats.",
  },
  {
    id: "maryland",
    name: "Maryland",
    region: "The harbor",
    blurb: "Harbor outbreak. Bridge traffic, and potholes with seniority.",
    requires: "colorado",
    playable: true,
    travel: false,
    sky: ["#b7d7ea", "#f3efe4"],
    ink: "#1d3557",
    accent: "#c1121f",
    road: "#4a5562",
    early: ["blue-crab", "seagull", "honk"],
    mid: ["blue-crab", "honk", "spice-shaker", "seagull"],
    late: ["skiff", "spice-shaker", "honk", "blue-crab"],
    wide: ["skiff"],
    fast: ["honk"],
    obstacle: "tires",
    fodder: ["herd-crab", "herd-gull", "herd-hare"],
    pairs: marylandPairs,
    coachOffer: weapon("ferry-horn"),
    boss: "mallet-crab",
    minis: ["bridge-gull", "pothole-king"],
    bossTitle: "THE HARBOR BRUTE",
    bossSub: "It learned the swing on the docks.",
    miniTitles: [
      { title: "BRIDGE REACHER", sub: "Long arms. Worse manners." },
      { title: "POTHOLE BRUTE", sub: "This one has a mailing address." },
    ],
    win: ["The harbor blinks first.", "The lane is yours until the next bridge."],
    lose: ["The horde keeps swinging.", "Mind the gap. And the arms."],
    timeout: ["They are late and still won.", "The swing clock runs out."],
    nextBlurb: "Pennsylvania is next on the line. That round is not in yet.",
  },
  {
    id: "pennsylvania",
    name: "Pennsylvania",
    region: "The line",
    blurb: "Cheesesteaks, freight, and a groundhog with a grievance.",
    requires: "maryland",
    playable: false,
    travel: false,
    sky: ["#d8dee9", "#f6f1e7"],
    ink: "#2b2d42",
    accent: "#f4a261",
    road: "#3d405b",
    early: [],
    mid: [],
    late: [],
    wide: [],
    fast: [],
    obstacle: "pothole",
    fodder: ["herd-goat"],
    pairs: [],
    coachOffer: weapon("trail-pistol"),
    boss: "pass-goat",
    minis: [],
    bossTitle: "",
    bossSub: "",
    miniTitles: [],
    win: [],
    lose: [],
    timeout: [],
    nextBlurb: "",
  },
  {
    id: "tucson",
    name: "Tucson",
    region: "The desert",
    blurb: "Saguaros, monsoon dark, tumbleweeds with plans.",
    requires: "pennsylvania",
    playable: false,
    travel: false,
    sky: ["#f4a261", "#fff3e0"],
    ink: "#6b3f2a",
    accent: "#2a9d8f",
    road: "#6b705c",
    early: [],
    mid: [],
    late: [],
    wide: [],
    fast: [],
    obstacle: "luggage",
    fodder: ["herd-hare"],
    pairs: [],
    coachOffer: weapon("trail-pistol"),
    boss: "pass-goat",
    minis: [],
    bossTitle: "",
    bossSub: "",
    miniTitles: [],
    win: [],
    lose: [],
    timeout: [],
    nextBlurb: "",
  },
  {
    id: "paris",
    name: "Paris",
    region: "The metro",
    blurb: "Bakeries, scooters, and pigeons with nerve.",
    requires: "tucson",
    playable: false,
    travel: true,
    sky: ["#c5d5ea", "#f7f1e8"],
    ink: "#22223b",
    accent: "#9b2226",
    road: "#4a4e69",
    early: [],
    mid: [],
    late: [],
    wide: [],
    fast: [],
    obstacle: "luggage",
    fodder: ["herd-hare"],
    pairs: [],
    coachOffer: weapon("trail-pistol"),
    boss: "pass-goat",
    minis: [],
    bossTitle: "",
    bossSub: "",
    miniTitles: [],
    win: [],
    lose: [],
    timeout: [],
    nextBlurb: "",
  },
  {
    id: "amsterdam",
    name: "Amsterdam",
    region: "The canal",
    blurb: "Bikes, trams, bridges, and a stroopwafel under fire.",
    requires: "paris",
    playable: false,
    travel: true,
    sky: ["#bde0fe", "#fff8ee"],
    ink: "#1b3a4b",
    accent: "#e09f3e",
    road: "#415a77",
    early: [],
    mid: [],
    late: [],
    wide: [],
    fast: [],
    obstacle: "luggage",
    fodder: ["herd-gull"],
    pairs: [],
    coachOffer: weapon("trail-pistol"),
    boss: "pass-goat",
    minis: [],
    bossTitle: "",
    bossSub: "",
    miniTitles: [],
    win: [],
    lose: [],
    timeout: [],
    nextBlurb: "",
  },
];

/** Each stop wears the next round format. Nobody picks it. */
export function levelCoat(destinationId: string): { format: FormatId } {
  const index = Math.max(0, DESTINATIONS.findIndex((item) => item.id === destinationId));
  return {
    format: FORMATS[index % FORMATS.length]!.id,
  };
}

export function destinationById(id: string): Destination {
  const found = DESTINATIONS.find((destination) => destination.id === id);
  if (!found) throw new Error(`Unknown destination ${id}`);
  return found;
}

export function offerLabel(offer: Offer): string {
  if (offer.type === "companion") return "Lane buddy";
  return weaponById(offer.weaponId).name;
}

export function offerKey(offer: Offer): string {
  return offer.type === "companion" ? "companion" : offer.weaponId;
}
