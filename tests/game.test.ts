import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botInput } from "../src/game/bot";
import { compareOffer } from "../src/game/compare";
import { weaponById } from "../src/game/content";
import { dailySeed, denverDay } from "../src/game/daily";
import { archetypeById } from "../src/game/content";
import { buildSchedule } from "../src/game/generate";
import { claimDecision, validateName } from "../src/game/names";
import { destinationGate, practiceReady, defaultSave } from "../src/game/progress";
import { mulberry32 } from "../src/game/rng";
import { isPlausibleScore, keepBetter, multiplierFor } from "../src/game/score";
import { createRun, step } from "../src/game/sim";
import { PLAYER_R, W, type RunState, type SpawnEvent } from "../src/game/types";

describe("weapons tell the truth", () => {
  it("compares a pistol with a spread using the real multiplier", () => {
    const comparison = compareOffer(weaponById("trail-pistol"), { type: "weapon", weaponId: "hail-spread" }, false);
    assert.equal(comparison.title, "Hail spread");
    assert.ok(comparison.lines.some((line) => line.includes("1 → 5 pellets")));
    assert.ok(comparison.lines.some((line) => line.includes("volley if all hit")));
    assert.equal(comparison.footer, "vs Trail pistol");
    assert.equal(comparison.owned, false);
  });

  it("says when a crate is already equipped", () => {
    const comparison = compareOffer(weaponById("espresso"), { type: "weapon", weaponId: "espresso" }, false);
    assert.equal(comparison.owned, true);
    assert.match(comparison.lines[0]!, /Already yours/);
  });

  it("keeps the buddy from replacing the gun", () => {
    const comparison = compareOffer(weaponById("cog-train"), { type: "companion" }, false);
    assert.deepEqual(comparison.lines, ["Adds a second shooter", "Your gun stays"]);
  });
});

describe("schedule", () => {
  it("is stable for a seed and leaves a dodge gap", () => {
    const first = buildSchedule(mulberry32(42), "colorado", "push", false);
    const second = buildSchedule(mulberry32(42), "colorado", "push", false);
    assert.deepEqual(first.events, second.events);
    assert.equal(first.setpieces.at(-1)?.final, true);
    for (const destination of ["colorado", "maryland"]) {
      for (const format of ["push", "gauntlet"] as const) {
        for (let seed = 1; seed <= 24; seed += 1) {
          const schedule = buildSchedule(mulberry32(seed), destination, format, seed % 2 === 0);
          assertSafeBeats(schedule.events);
          assert.ok(schedule.events.some((event) => event.type === "crate"));
          assert.equal(schedule.setpieces.filter((piece) => piece.final).length, 1);
        }
      }
    }
  });
});

describe("simulation", () => {
  it("shoots up, claims nothing on its own, and keeps the weapon after a hit", () => {
    const state = createRun(run(7));
    step(state, 0.5, { pointerX: 80, left: false, right: false });
    assert.ok(state.bullets.some((bullet) => bullet.from === "player" && bullet.vy < 0));
    const weapon = state.weapon.id;
    const enemy = state.enemies.find((item) => item.hurts);
    if (!enemy) {
      state.enemies.push({
        ...fakeEnemy(),
        x: state.playerX,
        y: state.playerY,
      });
    } else {
      enemy.x = state.playerX;
      enemy.y = state.playerY;
      enemy.vy = 0;
    }
    step(state, 1 / 60, { pointerX: state.playerX, left: false, right: false });
    assert.equal(state.hearts, 2);
    assert.equal(state.chain, 0);
    assert.equal(state.weapon.id, weapon);
    step(state, 0.2, { pointerX: state.playerX, left: false, right: false });
    assert.equal(state.hearts, 2);
  });

  it("does not drop a combo during a quiet stretch", () => {
    const state = createRun(run(3));
    state.events = [];
    state.setpieces = [];
    state.chain = 6;
    state.multiplier = 2;
    step(state, 4, idle(state.playerX));
    assert.equal(state.chain, 6);
    assert.equal(state.multiplier, 2);
  });

  it("lets a careful bot finish Colorado and Maryland", () => {
    const results: string[] = [];
    for (const destination of ["colorado", "maryland"]) {
      for (const format of ["push", "gauntlet"] as const) {
        let wins = 0;
        for (let seed = 1; seed <= 5; seed += 1) {
          const state = createRun({ ...run(seed * 17 + destination.length), destination, format });
          const outcome = play(state);
          if (outcome === "won") wins += 1;
          else results.push(`${destination} ${format} seed ${seed} ${outcome} phase ${state.phase} ${state.weapon.name} kills ${state.parts.kills} hearts ${state.hearts} t ${state.time.toFixed(1)} ${state.lossReason ?? ""}`);
        }
        assert.ok(wins >= 4, `${destination} ${format} won ${wins}/5\n${results.join("\n")}`);
      }
    }
  });
});

describe("progression and board", () => {
  it("opens the next stop only after a clear", () => {
    const save = defaultSave();
    assert.equal(destinationGate("colorado", save).open, true);
    assert.equal(destinationGate("maryland", save).tone, "progress");
    save.cleared.push("colorado");
    assert.equal(destinationGate("maryland", save).open, true);
    assert.equal(destinationGate("paris", save).tone, "held");
    save.holdTravel = false;
    assert.equal(destinationGate("paris", save).tone, "soon");
    save.lossStreak.colorado = 3;
    assert.equal(practiceReady("colorado", save), true);
  });

  it("protects a claimed name and rejects a bad score", () => {
    assert.equal(validateName("Mary"), null);
    assert.equal(validateName("x"), "Use at least 2 characters.");
    assert.equal(claimDecision(null, null, (value) => value), "create");
    assert.equal(claimDecision("abc", "abc", (value) => value), "owner");
    assert.equal(claimDecision("abc", "nope", (value) => value), "taken");
    assert.equal(keepBetter(100, 40), false);
    assert.equal(isPlausibleScore(1_500_000), false);
    assert.equal(multiplierFor(4), 1);
    assert.equal(multiplierFor(5), 2);
    assert.equal(dailySeed("2026-10-24", "colorado"), dailySeed("2026-10-24", "colorado"));
    assert.notEqual(dailySeed("2026-10-24", "colorado"), dailySeed("2026-10-25", "colorado"));
    assert.match(denverDay(new Date("2026-10-24T18:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
  });
});

function run(seed: number) {
  return {
    seed,
    destination: "colorado",
    format: "push" as const,
    practice: false,
    coach: false,
    daily: false,
    day: "2026-10-24",
  };
}

function idle(x: number) {
  return { pointerX: x, left: false, right: false };
}

function play(state: RunState): RunState["status"] {
  let guard = 0;
  while (state.status === "running" && guard < 25000) {
    step(state, 1 / 60, botInput(state));
    guard += 1;
  }
  return state.status;
}

function assertSafeBeats(events: SpawnEvent[]) {
  const groups = new Map<number, SpawnEvent[]>();
  for (const event of events) {
    if (event.type !== "mob") continue;
    const group = groups.get(event.t) ?? [];
    group.push(event);
    groups.set(event.t, group);
  }
  for (const group of groups.values()) {
    const blocks = group.map((event) => {
      if (event.type !== "mob") return [0, 0] as const;
      const body = archetypeById(event.archetype);
      return [event.x - body.hw - PLAYER_R, event.x + body.hw + PLAYER_R] as const;
    });
    blocks.sort((a, b) => a[0] - b[0]);
    let cursor = 28;
    let open = false;
    for (const [start, end] of blocks) {
      if (start > cursor) open = true;
      cursor = Math.max(cursor, end);
    }
    if (cursor < W - 28) open = true;
    assert.equal(open, true);
  }
}

function fakeEnemy(): RunState["enemies"][number] {
  return {
    id: 999,
    archetype: "driver",
    name: "Lane driver",
    sprite: "driver",
    x: 0,
    y: 0,
    hw: 20,
    hh: 20,
    hp: 40,
    maxHp: 40,
    vy: 0,
    vx: 0,
    originX: 0,
    points: 10,
    pattern: "drift",
    shootable: true,
    hurts: true,
    kind: "mob",
    age: 0,
    flash: 0,
    dormant: false,
    shootEvery: 0,
    canDash: false,
    summon: null,
    summonEvery: 0,
    stayY: 0,
    cooldown: 0,
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
}
