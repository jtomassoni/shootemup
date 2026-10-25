import { destinationById, type Destination } from "./content";
import { clamp, laneCenter, laneX } from "./geometry";
import { pick } from "./rng";
import type { FormatId, Offer, Schedule, SpawnEvent } from "./types";

const PUSH_BOSS_AT = 86;

export function buildSchedule(
  rand: () => number,
  destinationId: string,
  format: FormatId,
  coach: boolean,
): Schedule {
  const destination = destinationById(destinationId);
  const events: SpawnEvent[] = [];
  const memory = { buddy: false, pair: 1 };

  if (format === "push") {
    fillWaves(rand, destination, events, memory, 1.35, PUSH_BOSS_AT - 1.15, coach);
    return finish(rand, destination, events, [
      {
        at: PUSH_BOSS_AT,
        archetype: destination.boss,
        final: true,
        limit: 30,
        title: destination.bossTitle,
        sub: destination.bossSub,
      },
    ]);
  }

  const marks = [
    { at: 22, archetype: destination.minis[0]!, final: false, limit: 18, title: destination.miniTitles[0]! },
    { at: 44, archetype: destination.minis[1]!, final: false, limit: 18, title: destination.miniTitles[1]! },
    { at: 66, archetype: destination.boss, final: true, limit: 30, title: { title: destination.bossTitle, sub: destination.bossSub } },
  ];
  let from = 1.2;
  const setpieces = marks.map((mark, index) => {
    fillWaves(rand, destination, events, memory, from, mark.at - 1.05, coach && index === 0);
    from = mark.at + 0.35;
    return {
      at: mark.at,
      archetype: mark.archetype,
      final: mark.final,
      limit: mark.limit,
      title: mark.title.title,
      sub: mark.title.sub,
    };
  });
  return finish(rand, destination, events, setpieces);
}

function finish(
  rand: () => number,
  destination: Destination,
  events: SpawnEvent[],
  setpieces: Schedule["setpieces"],
): Schedule {
  events.sort((a, b) => a.t - b.t);
  return {
    events,
    setpieces,
    winLine: pick(rand, destination.win),
    loseLine: pick(rand, destination.lose),
    timeoutLine: pick(rand, destination.timeout),
  };
}

function fillWaves(
  rand: () => number,
  destination: Destination,
  events: SpawnEvent[],
  memory: { buddy: boolean; pair: number },
  start: number,
  end: number,
  coach: boolean,
) {
  if (end - start < 3.5) return;
  let t = start;
  let nextCrate = start + (coach ? 10.5 : 6.5);

  if (coach) {
    events.push({
      t: start + 1.3,
      type: "banner",
      title: "Shoot the crate you want",
      sub: "The other one leaves when you take one.",
    });
    events.push({
      t: start + 2.15,
      type: "crate",
      offer: destination.coachOffer,
      x: laneCenter(2),
      pair: 0,
    });
    t = start + 4;
  }

  const gap = { lane: 2 };
  while (t < end) {
    if (t >= nextCrate && t < end - 1.8) {
      const [left, right] = pickPair(rand, destination, memory.buddy);
      if (left.type === "companion" || right.type === "companion") memory.buddy = true;
      const pair = memory.pair;
      memory.pair += 1;
      const flip = rand() < 0.5;
      events.push({ t, type: "crate", offer: flip ? left : right, x: laneCenter(1), pair });
      events.push({ t, type: "crate", offer: flip ? right : left, x: laneCenter(3), pair });
      nextCrate = t + 14.5;
      t += 2.3;
      continue;
    }

    const pressure = (t - start) / Math.max(1, end - start);
    const columns = columnsFor(pressure);
    const width = gapWidth(columns);
    const inset = 2;
    const gapMax = Math.max(inset, columns - width - inset);
    if (rand() < 0.08) {
      gap.lane = clamp(gap.lane + (rand() < 0.5 ? -1 : 1), inset, gapMax);
    } else {
      gap.lane = clamp(gap.lane, inset, gapMax);
    }
    events.push(...crowdRank(rand, destination, t, columns, gap.lane, width));
    const flank = gap.lane > (columns - width) / 2 ? 0 : columns - 1;
    const elitePool = pressure < 0.34 ? destination.early : pressure < 0.68 ? destination.mid : destination.late;
    const elites = elitePool.filter((id) => !destination.wide.includes(id));
    if (elites.length > 0 && rand() < 0.42) {
      events.push({ t: t + 0.05, type: "mob", archetype: pick(rand, elites), x: laneX(flank, columns) });
    }
    if (rand() < 0.1 && pressure > 0.18) {
      events.push({ t: t + 0.09, type: "mob", archetype: destination.obstacle, x: laneX(flank, columns) });
    }
    const spacing = pressure < 0.28 ? 1.05 : pressure < 0.62 ? 0.48 : 0.26;
    t += spacing;
  }
}

function pickPair(rand: () => number, destination: Destination, buddyUsed: boolean): [Offer, Offer] {
  const available = destination.pairs.filter((pair) => {
    if (!buddyUsed) return true;
    return pair.every((offer) => offer.type !== "companion");
  });
  const pair = pick(rand, available.length > 0 ? available : destination.pairs);
  return [pair[0], pair[1]];
}

function columnsFor(pressure: number): number {
  if (pressure < 0.28) return 8;
  if (pressure < 0.62) return 11;
  return 14;
}

function gapWidth(columns: number): number {
  return columns >= 12 ? 4 : 3;
}

function crowdRank(
  rand: () => number,
  destination: Destination,
  t: number,
  columns: number,
  gapLane: number,
  width: number,
): SpawnEvent[] {
  const fodder = destination.fodder.length > 0 ? destination.fodder : destination.early;
  const events: SpawnEvent[] = [];
  for (let lane = 0; lane < columns; lane += 1) {
    if (lane >= gapLane && lane < gapLane + width) continue;
    events.push({
      t,
      type: "mob",
      archetype: pick(rand, fodder),
      x: laneX(lane, columns),
    });
  }
  return events;
}
