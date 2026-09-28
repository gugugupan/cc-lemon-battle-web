import { describe, expect, it } from "vitest";
import { decide, DEFAULT_AI, predict, rollTell } from "../src/core/ai";
import { Battle, type BattleEvent } from "../src/core/battle";
import { itemById, type Consumable, type Relic } from "../src/core/items";
import { Rng } from "../src/core/rng";
import { type ActionId, affordable, type Fighter, judge, resolve } from "../src/core/rules";
import { enemyFor, Run } from "../src/core/run";

const f = (energy = 0, hp = 5): Fighter => ({ hp, maxHp: 5, energy, maxEnergy: 3 });

describe("resolve", () => {
  const cases: [ActionId, ActionId, number, number][] = [
    ["attack", "attack", 0, 0],
    ["attack", "guard", 0, 0],
    ["attack", "charge", 0, 1],
    ["attack", "special", 1, 0],
    ["guard", "special", 1, 0],
    ["charge", "attack", 1, 0],
    ["charge", "special", 2, 0],
    ["special", "attack", 0, 1],
    ["special", "guard", 0, 1],
    ["special", "charge", 0, 2],
    ["special", "special", 0, 0],
  ];
  it.each(cases)("%s vs %s", (pa, ea, playerLoss, enemyLoss) => {
    const p = f(3);
    const e = f(3);
    resolve(p, pa, e, ea);
    expect(5 - p.hp).toBe(playerLoss);
    expect(5 - e.hp).toBe(enemyLoss);
  });

  it("whiffs an attack it can't pay for", () => {
    const p = f(0);
    const e = f(0);
    const r = resolve(p, "attack", e, "charge");
    expect(r.player.whiffed).toBe(true);
    expect(e.hp).toBe(5);
  });

  it("caps energy when charging", () => {
    const p = f(3);
    resolve(p, "charge", f(0), "guard");
    expect(p.energy).toBe(3);
  });
});

describe("judge", () => {
  it("grades by distance to the beat", () => {
    expect(judge(0.04)).toBe("perfect");
    expect(judge(-0.1)).toBe("good");
    expect(judge(0.2)).toBe("miss");
    expect(judge(0.055, 1.2)).toBe("perfect");
  });
});

describe("ai", () => {
  it("never charges at full energy and never picks the unaffordable", () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const self = f(rng.int(0, 3));
      const a = decide(self, f(rng.int(0, 3)), ["attack", "charge"], DEFAULT_AI, rng);
      expect(affordable(self)).toContain(a);
      if (self.energy === 3) expect(a).not.toBe("charge");
    }
  });

  it("predicts the usual follow-up", () => {
    expect(predict(["charge", "attack", "charge", "attack", "charge"], 5)).toBe("attack");
  });

  it("tells only name possible moves", () => {
    const rng = new Rng(5);
    for (let i = 0; i < 300; i++) {
      const self = f(0);
      const tell = rollTell(self, "charge", 1, 0.3, 0, rng);
      expect(["charge", "guard"]).toContain(tell);
    }
  });
});

function fight(relics: Relic[] = [], slots: (Consumable | null)[] = []) {
  const spec = enemyFor(1, new Rng(1));
  spec.relics = [];
  spec.tellChance = 0;
  const events: BattleEvent[] = [];
  const battle = new Battle(spec, { hp: 5, maxHp: 5, relics, slots }, new Rng(2), (e) => events.push(e));
  battle.start();
  return { battle, events, spb: 60 / spec.bpm };
}

describe("battle", () => {
  it("only takes actions on beat 4, then rests a bar", () => {
    const { battle, spb } = fight();
    for (let b = 0; b <= 5; b++) battle.onBeat(b);
    expect(battle.pressAction("charge", 6, spb)).toBeNull();
    battle.onBeat(6);
    expect(battle.pressAction("charge", 7.02, spb)).toBe("perfect");
    expect(battle.player.energy).toBe(1);
    expect(battle.isRestBar(2)).toBe(true);
    expect(battle.pressAction("attack", 11, spb)).toBeNull();
  });

  it("counts any graded action toward the combo and resets it on a wait", () => {
    const { battle, spb } = fight();
    for (let b = 0; b < 7; b++) battle.onBeat(b);
    battle.pressAction("guard", 7.2, spb);
    expect(battle.combo).toBe(1);
    for (let b = 8; b < 16; b++) {
      battle.onBeat(b);
      battle.onOffbeat(b);
    }
    expect(battle.combo).toBe(0);
  });

  it("uses items on beats 1-3 only, with Perfect bonuses", () => {
    const { battle, spb } = fight([], [itemById("ramune") as Consumable, itemById("lemon_bomb") as Consumable]);
    for (let b = 0; b < 5; b++) battle.onBeat(b);
    expect(battle.useItem(0, 7, spb)).toBeNull();
    expect(battle.useItem(0, 5, spb)).toBe("perfect");
    expect(battle.player.energy).toBe(2);
    expect(battle.useItem(1, 5, spb)).toBeNull();
    expect(battle.useItem(1, 6.3, spb)).toBe("miss");
    expect(battle.enemy.hp).toBe(battle.enemy.maxHp - 1);
  });

  it("fires relics at battle start and on rest beats", () => {
    const { battle, spb } = fight([itemById("cold_lemon") as Relic, itemById("eco") as Relic]);
    expect(battle.player.energy).toBe(1);
    let beat = 0;
    for (let attacks = 0; attacks < 3; ) {
      battle.onBeat(beat);
      const bar = Math.floor(beat / 4);
      if (beat % 4 === 3 && !battle.isRestBar(bar)) {
        battle.player.energy = Math.max(battle.player.energy, 1);
        battle.enemy.hp = 5;
        battle.pressAction("attack", beat, spb);
        attacks++;
      }
      battle.onOffbeat(beat);
      beat++;
    }
    const before = battle.player.energy;
    for (let i = 0; i < 4; i++) battle.onBeat(beat + i);
    expect(battle.player.energy).toBe(before + 1);
  });
});

describe("run", () => {
  it("ramps enemies every fight", () => {
    const rng = new Rng(1);
    const first = enemyFor(1, rng);
    const tenth = enemyFor(10, rng);
    expect(tenth.maxHp).toBeGreaterThan(first.maxHp);
    expect(tenth.bpm).toBeGreaterThan(first.bpm);
    expect(tenth.relics.length).toBeGreaterThan(first.relics.length);
  });

  it("pays out, heals and restocks after a win", () => {
    const run = new Run(1);
    run.finishBattle(true, 3);
    expect(run.round).toBe(2);
    expect(run.hp).toBe(4);
    expect(run.gold).toBeGreaterThan(20);
    expect(run.stock.length).toBe(5);
  });

  it("buys items and services with gold", () => {
    const run = new Run(1);
    run.rollShop();
    run.gold = 200;
    const relicIndex = run.stock.findIndex((s) => s.item.kind === "relic");
    expect(run.buy(relicIndex)).toBe("ok");
    expect(run.buy(relicIndex)).toBe("sold_out");
    expect(run.relics.length).toBe(1);
    expect(run.buyService("slot")).toBe("ok");
    expect(run.buyService("slot")).toBe("ok");
    expect(run.buyService("slot")).toBe("maxed");
    run.gold = 0;
    expect(run.buyService("maxHp")).toBe("no_gold");
  });
});
