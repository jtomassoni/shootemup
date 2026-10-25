const BLOCKED = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
];

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

export function validateName(raw: string): string | null {
  const name = normalizeName(raw);
  if (name.length < 2) return "Use at least 2 characters.";
  if (name.length > 16) return "Keep it to 16 characters.";
  if (!/^[A-Za-z0-9][A-Za-z0-9 '\-]*$/.test(name)) {
    return "Letters, numbers, spaces, and hyphens.";
  }
  const folded = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (BLOCKED.some((word) => folded.includes(word))) {
    return "Pick a name that stays PG-13.";
  }
  return null;
}

export type ClaimDecision = "create" | "owner" | "taken";

export function claimDecision(
  existingHash: string | null,
  providedSecret: string | null,
  hash: (secret: string) => string,
): ClaimDecision {
  if (!existingHash) return "create";
  if (providedSecret && hash(providedSecret) === existingHash) return "owner";
  return "taken";
}
