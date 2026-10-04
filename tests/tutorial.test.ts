import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("navigator", { language: "ja" });
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
import { Battle, type BattleEvent } from "../src/core/battle";
import { itemById } from "../src/core/items";
import { Rng } from "../src/core/rng";
import { enemyFor } from "../src/core/run";
import { TUTORIAL_RELICS, TUTORIAL_STEPS, TutorialTracker, type TutorialStep } from "../src/core/tutorial";
import type { ActionId } from "../src/core/rules";

const fights = TUTORIAL_STEPS.filter((s) => s.goal === "win");

function setup(step: TutorialStep, seed = 2) {
  const spec = enemyFor(1, new Rng(1));
  spec.relics = [];
  spec.tellChance = 0;
  if (step.enemyHp !== undefined) spec.maxHp = step.enemyHp;
  const tracker = new TutorialTracker(step);
  const verdicts: string[] = [];
  const enemyMoves: ActionId[] = [];
  const battle = new Battle(spec, { hp: 5, maxHp: 5, relics: [], slots: [] }, new Rng(seed), (e: BattleEvent) => {
    if (e.type === "reveal" && !e.result.enemy.whiffed) enemyMoves.push(e.result.enemy.action);
    const v = tracker.onEvent(e);
    if (v) verdicts.push(v);
  }, { restBars: false, enemyScript: step.enemy });
  battle.start();
  battle.player.energy = 0;
  return { battle, verdicts, enemyMoves };
}

/** Plays bars after the count-in; `choose` picks the press for each bar (null waits). */
function play(step: TutorialStep, choose: (battle: Battle, bar: number) => ActionId | null, bars = 40, seed = 2) {
  const run = setup(step, seed);
  for (let beat = 0; beat < bars * 4 && !run.battle.finished; beat++) {
    run.battle.onBeat(beat);
    if (beat % 4 === 3 && beat > 3) {
      const a = choose(run.battle, Math.floor(beat / 4));
      if (a) run.battle.pressAction(a, beat, 0.75);
    }
    run.battle.onOffbeat(beat);
  }
  return run;
}

const chargeThenAttack = (b: Battle) => (b.player.energy > 0 ? "attack" : "charge");

describe("tutorial fights", () => {
  it("five fights, each teaching one more input, the last a boss with a relic pick", () => {
    expect(fights).toHaveLength(5);
    expect(fights.map((s) => s.allowed.length)).toEqual([2, 3, 4, 5, 5]);
    expect(fights[0].allowed).toEqual(["charge", "attack"]);
    expect(fights[1].allowed).toContain("guard");
    expect(fights[2].allowed).toContain("special");
    expect(fights[3].allowed).toContain("item");
    expect(fights[3].items?.length).toBeGreaterThan(0);
    expect(fights[4]).toMatchObject({ boss: true, relicPick: true });
    expect(fights[4].enemy).toBeUndefined();
  });

  it("fight 1: the dummy only charges, so charge → attack wins", () => {
    const { verdicts, enemyMoves } = play(fights[0], chargeThenAttack);
    expect(verdicts).toEqual(["success"]);
    expect(new Set(enemyMoves)).toEqual(new Set(["charge"]));
  });

  it("fight 2: the dummy charges and attacks", () => {
    const { enemyMoves } = play(fights[1], () => "guard", 30);
    expect(new Set(enemyMoves)).toEqual(new Set(["charge", "attack"]));
  });

  it("fight 3: the dummy also guards", () => {
    const { enemyMoves } = play(fights[2], () => "guard", 30);
    expect(enemyMoves).toContain("guard");
  });

  it("a lost fight is a fail", () => {
    const { verdicts } = play(fights[1], () => "charge", 80);
    expect(verdicts).toEqual(["fail"]);
  });

  it("the beat step passes after watching its bars", () => {
    const watch = TUTORIAL_STEPS.find((s) => s.goal === "watch")!;
    expect(play(watch, () => null, 3).verdicts).toEqual([]);
    expect(play(watch, () => null, 6).verdicts[0]).toBe("success");
  });

  it("the boss's relic offer is made of real player relics", () => {
    for (const id of TUTORIAL_RELICS) expect(itemById(id).kind).toBe("relic");
  });

  it("every line and hint has text", async () => {
    const { hasKey } = await import("../src/i18n");
    for (const s of TUTORIAL_STEPS) {
      for (const key of [...s.lines, ...(s.hint ? [s.hint] : [])]) expect(hasKey(key), key).toBe(true);
    }
    expect(hasKey("tut_pick")).toBe(true);
  });
});
