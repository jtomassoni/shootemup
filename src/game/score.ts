export function multiplierFor(chain: number): number {
  if (chain >= 20) return 4;
  if (chain >= 10) return 3;
  if (chain >= 5) return 2;
  return 1;
}

export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toLocaleString("en-US");
}

export function isPlausibleScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= 999_999;
}

export function keepBetter(previous: number | null, next: number): boolean {
  if (previous == null) return true;
  return next > previous;
}
