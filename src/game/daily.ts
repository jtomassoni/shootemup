import { hashString } from "./rng";

/** Shared calendar day so a morning round is the same on both phones. */
export function denverDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dailySeed(day: string, destination: string): number {
  return hashString(`hold-the-lane:${day}:${destination}`);
}

export function acceptableDailyDay(claimed: string, now = new Date()): boolean {
  if (claimed === denverDay(now)) return true;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return claimed === denverDay(yesterday);
}
