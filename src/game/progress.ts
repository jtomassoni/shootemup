import { AVATARS, DESTINATIONS, destinationById } from "./content";
import type { Bucket, FormatId } from "./types";

export type Save = {
  version: 1;
  avatarId: string;
  format: FormatId;
  muted: boolean;
  music: boolean;
  showHitboxes: boolean;
  gamertag: string;
  secret: string;
  cleared: string[];
  lossStreak: Record<string, number>;
  runs: number;
  bests: Record<string, number>;
  unlockAll: boolean;
  holdTravel: boolean;
};

export const SAVE_KEY = "hold-the-lane:v1";

export function defaultSave(): Save {
  return {
    version: 1,
    avatarId: "nurse",
    format: "push",
    muted: false,
    music: false,
    showHitboxes: false,
    gamertag: "",
    secret: "",
    cleared: [],
    lossStreak: {},
    runs: 0,
    bests: {},
    unlockAll: false,
    holdTravel: true,
  };
}

export function sanitizeSave(value: unknown): Save {
  const base = defaultSave();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<Save> & { style?: unknown };
  const avatarId = AVATARS.some((avatar) => avatar.id === raw.avatarId) ? raw.avatarId! : base.avatarId;
  // Older saves carried an art style. There is one look now.
  const { style: _legacyStyle, ...rest } = raw;
  void _legacyStyle;
  return {
    ...base,
    ...rest,
    version: 1,
    avatarId,
    format: raw.format === "gauntlet" ? "gauntlet" : "push",
    muted: Boolean(raw.muted),
    music: Boolean(raw.music),
    showHitboxes: Boolean(raw.showHitboxes),
    gamertag: typeof raw.gamertag === "string" ? raw.gamertag.slice(0, 16) : "",
    secret: typeof raw.secret === "string" ? raw.secret : "",
    cleared: Array.isArray(raw.cleared) ? raw.cleared.filter((id): id is string => typeof id === "string") : [],
    lossStreak: raw.lossStreak && typeof raw.lossStreak === "object" ? raw.lossStreak : {},
    runs: typeof raw.runs === "number" ? raw.runs : 0,
    bests: raw.bests && typeof raw.bests === "object" ? raw.bests : {},
    unlockAll: Boolean(raw.unlockAll),
    holdTravel: raw.holdTravel !== false,
  };
}

export function bestKey(destination: string, format: FormatId, bucket: Bucket): string {
  return `${destination}|${format}|${bucket}`;
}

export type Gate = { open: boolean; reason: string; tone: "open" | "progress" | "soon" | "held" };

export function destinationGate(id: string, save: Save): Gate {
  const destination = destinationById(id);
  if (destination.travel && save.holdTravel) {
    return {
      open: false,
      tone: "held",
      reason: "Held the way a paid stop would be. Nothing to buy here.",
    };
  }
  if (!destination.playable) {
    const previous = destination.requires ? destinationById(destination.requires).name : "the stop before";
    return {
      open: false,
      tone: "soon",
      reason: `On the map after ${previous}. The round is not in yet.`,
    };
  }
  if (save.unlockAll || !destination.requires || save.cleared.includes(destination.requires)) {
    return { open: true, tone: "open", reason: destination.blurb };
  }
  return {
    open: false,
    tone: "progress",
    reason: `Clear ${destinationById(destination.requires).name} to open this stop.`,
  };
}

export function practiceReady(id: string, save: Save): boolean {
  return (save.lossStreak[id] ?? 0) >= 3;
}

export function orderedDestinations() {
  return DESTINATIONS;
}
