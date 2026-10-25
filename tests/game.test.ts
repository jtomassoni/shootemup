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
import { createRun, step, timerLabel } from "../src/game/sim";
import { PLAYER_R, PLAYER_Y, W, type RunState, type SpawnEvent } from "../src/game/types";

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
    assert.equal(first.setpieces.length, 0);
    for (const destination of ["colorado", "maryland"]) {
      for (const format of ["push", "gauntlet"] as const) {
        for (let seed = 1; seed <= 24; seed += 1) {
          const schedule = buildSchedule(mulberry32(seed), destination, format, seed % 2 === 0);
          assertSafeBeats(schedule.events);
          assert.ok(schedule.events.some((event) => event.type === "crate"));
          assert.equal(schedule.setpieces.length, 0);
          const last = schedule.events.at(-1)!;
          assert.ok(last.t > 80 && last.t <= 90, `${destination} ${format} seed ${seed} ends at ${last.t}`);
          assert.ok(schedule.events.some((event) => event.type === "mob" && event.t < 8));
        }
      }
    }
  });
});

describe("simulation", () => {
  it("stays centered and aims where the pointer sits", () => {
    const state = createRun(run(9));
    step(state, 0.35, { pointerX: 36, left: false, right: false });
    state.bullets = [];
    step(state, 0.25, { pointerX: 36, left: false, right: false });
    assert.equal(state.playerX, W / 2);
    assert.ok(state.aim < -0.45);
    const shot = state.bullets.find((bullet) => bullet.from === "player");
    assert.ok(shot);
    assert.ok(shot.vx < 0 && shot.vy < 0);
    step(state, 0.55, { pointerX: null, left: false, right: true });
    assert.ok(state.aim > 0.25);
    assert.equal(state.playerX, W / 2);
  });

  it("shoots up, claims nothing on its own, and keeps the weapon after a hit", () => {
    const state = createRun(run(7));
    step(state, 0.5, { pointerX: 80, left: false, right: false });
    assert.equal(state.playerX, W / 2);
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

  it("wins when the scheduled enemies are gone, with no countdown", () => {
    const state = createRun(run(11));
    assert.equal(timerLabel(state).text, "");
    const last = state.events.at(-1)!;
    assert.ok(last.t > 80 && last.t <= 90);
    state.eventIndex = state.events.length;
    state.enemies = [];
    state.crates = [];
    state.bullets = [];
    step(state, 1 / 60, idle(state.playerX));
    assert.equal(state.status, "won");
    assert.equal(state.parts.fromBoss, 0);
  });

  it("brings a side enemy onto a player who stays in the middle", () => {
    const state = createRun(run(5));
    state.events = [];
    state.enemies = [{ ...fakeEnemy(), x: 36, originX: 36, y: 120, vy: 0, shootable: false, hp: 10, maxHp: 10 }];
    step(state, 3, idle(W / 2));
    assert.ok(Math.abs(state.enemies[0]!.x - W / 2) < 24);
  });

  it("holds a straight line once an enemy is about to reach the player", () => {
    const state = createRun(run(5));
    state.events = [];
    state.enemies = [{ ...fakeEnemy(), x: 80, originX: 80, y: PLAYER_Y - 40, vy: 0 }];
    step(state, 1, idle(W / 2));
    assert.ok(Math.abs(state.enemies[0]!.x - 80) < 1);
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
    let centerOpen = false;
    for (const [start, end] of blocks) {
      if (start > cursor) {
        open = true;
        if (cursor < W / 2 && start > W / 2) centerOpen = true;
      }
      cursor = Math.max(cursor, end);
    }
    if (cursor < W - 28) {
      open = true;
      if (cursor < W / 2) centerOpen = true;
    }
    assert.equal(open, true);
    assert.equal(centerOpen, true);
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
