import { offerLabel, volleyDamage, weaponById } from "./content";
import type { Offer, Weapon } from "./types";

export type Comparison = {
  title: string;
  lines: string[];
  footer: string;
  owned: boolean;
};

export function formatRatio(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return `${rounded}×`;
  return `${rounded.toFixed(1)}×`;
}

export function compareOffer(current: Weapon, offer: Offer, companionOwned: boolean): Comparison {
  const footer = `vs ${current.name}`;
  if (offer.type === "companion") {
    return {
      title: "Lane buddy",
      lines: companionOwned
        ? ["Already with you", "Pick the other one"]
        : ["Adds a second shooter", "Your gun stays"],
      footer,
      owned: companionOwned,
    };
  }

  const next = weaponById(offer.weaponId);
  if (next.id === current.id) {
    return {
      title: next.name,
      lines: ["Already yours", "Pick the other one"],
      footer,
      owned: true,
    };
  }

  const lines: string[] = [];
  if (next.pellets !== current.pellets) {
    lines.push(`${current.pellets} → ${next.pellets} pellets`);
  }

  const currentVolley = volleyDamage(current);
  const nextVolley = volleyDamage(next);
  const ratio = nextVolley / currentVolley;
  if (next.pellets > 1) {
    lines.push(`${formatRatio(ratio)} volley if all hit`);
  } else if (Math.abs(ratio - 1) >= 0.08) {
    lines.push(`${formatRatio(ratio)} per hit`);
  }

  if (next.fireInterval > current.fireInterval * 1.15) lines.push("Slower firing");
  else if (next.fireInterval < current.fireInterval * 0.85) lines.push("Faster firing");

  if (next.pierce > current.pierce && next.pierce > 1) lines.push("Pierces a column");
  if (next.splash > 0 && current.splash === 0) lines.push("Splash around the hit");
  if (next.windup > 0) lines.push("Winds up, then a huge hit");

  const unique = lines.filter((line, index) => lines.indexOf(line) === index).slice(0, 3);
  if (unique.length === 0) unique.push(next.name);
  if (unique.length === 1) unique.push(ratio >= 1 ? "Heavier than what you hold" : "Lighter than what you hold");

  return { title: next.name, lines: unique, footer, owned: false };
}

export function offerTitle(offer: Offer): string {
  return offerLabel(offer);
}
