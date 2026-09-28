import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("navigator", { language: "ja" });
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
import { Battle, type BattleEvent } from "../src/core/battle";
import { Rng } from "../src/core/rng";
import { enemyFor } from "../src/core/run";
import { TUTORIAL_STEPS, TutorialTracker, type TutorialStep } from "../src/core/tutorial";
import type { ActionId } from "../src/core/rules";

function play(step: TutorialStep, presses: (ActionId | null)[]) {
  const spec = enemyFor(1, new Rng(1));
  spec.relics = [];
  spec.tellChance = 0;
  const tracker = new TutorialTracker(step);
  const verdicts: string[] = [];
  const battle = new Battle(spec, { hp: 5, maxHp: 5, relics: [], slots: [] }, new Rng(2), (e: BattleEvent) => {
    const v = tracker.onEvent(e);
    if (v) verdicts.push(v);
  }, { restBars: false, enemyScript: step.enemy, noDefeat: true });
  battle.start();
  if (step.playerEnergy !== undefined) battle.player.energy = step.playerEnergy;
  let press = 0;
  for (let beat = 0; beat < 40 && press <= presses.length; beat++) {
    if (beat % 4 === 0 && step.enemyEnergy !== undefined) battle.enemy.energy = step.enemyEnergy;
    battle.onBeat(beat);
    if (beat % 4 === 3 && beat > 3) {
      const a = presses[press++];
      if (a) battle.pressAction(a, beat, 0.75);
    }
    battle.onOffbeat(beat);
  }
  return verdicts;
}

const step = (goal: string) => TUTORIAL_STEPS.find((s) => s.goal === goal)!;

describe("tutorial tracker", () => {
  it("charge lesson passes on a charge and fails on anything else", () => {
    expect(play(step("action"), ["charge"])[0]).toBe("success");
    expect(play(step("action"), ["guard"])[0]).toBe("fail");
    expect(play(step("action"), [null])[0]).toBe("fail");
  });

  it("attack lesson needs a hit on the charging dummy", () => {
    expect(play(step("hit"), ["attack"])[0]).toBe("success");
  });

  it("guard lesson needs the attack blocked", () => {
    expect(play(step("guarded"), ["guard"])[0]).toBe("success");
    expect(play(step("guarded"), ["charge"])[0]).toBe("fail");
  });

  it("special lesson lets you charge first, then needs the guard broken", () => {
    expect(play(step("guardBreak"), ["charge", "special"])[0]).toBe("success");
    expect(play(step("guardBreak"), ["attack"])[0]).toBe("fail");
  });

  it("wait lesson passes on an empty bar and fails on a press", () => {
    expect(play(step("wait"), [null])[0]).toBe("success");
    expect(play(step("wait"), ["guard"])[0]).toBe("fail");
  });

  it("every line and hint has text", async () => {
    const { hasKey } = await import("../src/i18n");
    for (const s of TUTORIAL_STEPS) {
      for (const key of [...s.lines, ...(s.hint ? [s.hint] : [])]) expect(hasKey(key), key).toBe(true);
    }
  });
});
