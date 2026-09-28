import { describe, expect, it } from "vitest";
import { decide, DEFAULT_AI, predict, rollTell } from "../src/core/ai";
import { Battle, type BattleEvent } from "../src/core/battle";
import { itemById, type Consumable, type Relic } from "../src/core/items";
import { Rng } from "../src/core/rng";
import { type ActionId, affordable, type Fighter, judge, resolve } from "../src/core/rules";
import { enemyFor, Run, tellVariety } from "../src/core/run";

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

  it("never guards against a player with no energy", () => {
    const rng = new Rng(8);
    for (let i = 0; i < 500; i++) {
      expect(decide(f(rng.int(0, 3)), f(0), ["charge"], { ...DEFAULT_AI, randomness: 0.5 }, rng)).not.toBe("guard");
    }
  });

  it("guards more when the player is at full energy", () => {
    const rng = new Rng(9);
    let low = 0;
    let full = 0;
    for (let i = 0; i < 2000; i++) {
      if (decide(f(1), f(1), [], { ...DEFAULT_AI, randomness: 0 }, rng) === "guard") low++;
      if (decide(f(1), f(3), [], { ...DEFAULT_AI, randomness: 0 }, rng) === "guard") full++;
    }
    expect(full).toBeGreaterThan(low * 1.5);
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

function fight(relics: Relic[] = [], slots: (Consumable | null)[] = [], restBars = true) {
  const spec = enemyFor(1, new Rng(1));
  spec.relics = [];
  spec.tellChance = 0;
  const events: BattleEvent[] = [];
  const battle = new Battle(spec, { hp: 5, maxHp: 5, relics, slots }, new Rng(2), (e) => events.push(e), { restBars });
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

  it("can skip rest bars and settle half a beat after the action", () => {
    const { battle, spb } = fight([itemById("eco") as Relic], [], false);
    let beat = 0;
    for (let attacks = 0; attacks < 3; beat++) {
      battle.onBeat(beat);
      const bar = Math.floor(beat / 4);
      expect(bar === 0 || !battle.isRestBar(bar)).toBe(true);
      if (beat % 4 === 3 && bar > 0) {
        battle.player.energy = Math.max(battle.player.energy, 1);
        battle.enemy.hp = 5;
        expect(battle.pressAction("attack", beat, spb)).not.toBeNull();
        attacks++;
      }
      const before = battle.player.energy;
      battle.onOffbeat(beat);
      if (attacks === 3 && beat % 4 === 3) expect(battle.player.energy).toBe(before + 1);
    }
    expect(beat).toBe(16);
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

  it("gives enemies more relics, from stronger tiers, as the run goes on", () => {
    const rng = new Rng(3);
    expect(enemyFor(1, rng).relics.length).toBe(0);
    expect(enemyFor(6, rng).relics.length).toBe(0);
    expect(enemyFor(7, rng).relics.length).toBe(1);
    expect(enemyFor(32, rng).relics.length).toBe(6);
    for (let i = 0; i < 50; i++) {
      for (const r of enemyFor(5, rng).relics) expect(r.tier).toBe(1);
      for (const r of enemyFor(9, rng).relics) expect(r.tier).toBeLessThanOrEqual(2);
    }
    expect(enemyFor(12, rng).startEnergy).toBe(2);
    expect(enemyFor(10, rng).maxEnergy).toBe(4);
  });

  it("widens the pool of tell lines as the run goes on", () => {
    expect([1, 2, 3, 4, 5, 9, 20].map(tellVariety)).toEqual([1, 1, 2, 2, 3, 5, 5]);
  });

  it("makes every fifth fight an elite with a free relic pick and double gold", () => {
    const rng = new Rng(4);
    const normal = enemyFor(9, rng);
    const elite = enemyFor(10, rng);
    expect(normal.elite).toBe(false);
    expect(elite.elite).toBe(true);
    expect(elite.maxHp).toBeGreaterThan(normal.maxHp);
    const run = new Run(2);
    run.round = 5;
    run.enemy = enemyFor(5, run.rng);
    const gold = run.finishBattle(true, 5);
    expect(gold).toBe(run.goldFor(5) * 2);
    expect(run.relicPick.length).toBe(3);
    const taken = run.takePick(1);
    expect(run.relics).toContain(taken);
    expect(run.relicPick.length).toBe(0);
  });

  it("charges for 2 from fight 10, and chargers always do", () => {
    const rng = new Rng(5);
    for (let i = 0; i < 40; i++) {
      const early = enemyFor(3, rng);
      expect(early.chargeBonus).toBe(early.personality === "charger" ? 1 : 0);
      expect(enemyFor(10, rng).chargeBonus).toBe(1);
    }
    const e = { hp: 5, maxHp: 5, energy: 0, maxEnergy: 3 };
    resolve({ hp: 5, maxHp: 5, energy: 0, maxEnergy: 3 }, "guard", e, "charge", { enemyChargeBonus: 1 });
    expect(e.energy).toBe(2);
  });

  it("clears after 20 wins, then goes on as endless mode", () => {
    const run = new Run(1);
    for (let i = 0; i < 19; i++) run.finishBattle(true, 5);
    expect(run.justCleared).toBe(false);
    run.finishBattle(true, 5);
    expect(run.wins).toBe(20);
    expect(run.justCleared).toBe(true);
    run.endless = true;
    expect(run.justCleared).toBe(false);
    run.finishBattle(true, 5);
    expect(run.round).toBe(22);
  });

  it("pays out, heals and restocks after a win", () => {
    const run = new Run(1);
    run.finishBattle(true, 2);
    expect(run.round).toBe(2);
    expect(run.hp).toBe(4);
    expect(run.gold).toBeGreaterThan(20);
    expect(run.stock.length).toBe(5);
  });

  it("sells owned relics and consumables for half price", () => {
    const run = new Run(1);
    run.relics.push(itemById("double_time") as Relic);
    const gold = run.gold;
    expect(run.sellRelic(0)).toBe(35);
    expect(run.relics.length).toBe(0);
    expect(run.sellSlot(0)).toBe(12);
    expect(run.slots[0]).toBeNull();
    expect(run.gold).toBe(gold + 47);
    expect(run.sellSlot(0)).toBe(0);
    expect(run.sellRelic(3)).toBe(0);
  });

  it("buys items and rests with gold", () => {
    const run = new Run(1);
    run.rollShop();
    run.gold = 200;
    const relicIndex = run.stock.findIndex((s) => s.item.kind === "relic");
    expect(run.buy(relicIndex)).toBe("ok");
    expect(run.buy(relicIndex)).toBe("sold_out");
    expect(run.relics.length).toBe(1);
    expect(run.slots.length).toBe(4);
    expect(run.rest()).toBe("maxed");
    run.hp = 3;
    expect(run.rest()).toBe("ok");
    expect(run.rest()).toBe("ok");
    expect(run.hp).toBe(5);
    expect(run.rest()).toBe("maxed");
    run.hp = 4;
    run.gold = 0;
    expect(run.rest()).toBe("no_gold");
  });
});

describe("rule-changing relics", () => {
  const relic = (id: string) => itemById(id) as Relic;

  function withEnemyRelics(ids: string[], playerRelics: Relic[] = [], slots: (Consumable | null)[] = []) {
    const spec = enemyFor(1, new Rng(1));
    spec.relics = ids.map(relic);
    spec.tellChance = 0;
    const events: BattleEvent[] = [];
    const battle = new Battle(spec, { hp: 5, maxHp: 5, relics: playerRelics, slots }, new Rng(2), (e) => events.push(e));
    battle.start();
    return { battle, events, spb: 60 / battle.bpm };
  }

  it("xray shows a tell every call bar", () => {
    const { battle, events } = withEnemyRelics([], [relic("xray")]);
    for (let b = 0; b < 40; b++) {
      battle.onBeat(b);
      battle.onOffbeat(b);
    }
    expect(events.filter((e) => e.type === "tell").length).toBe(9);
  });

  it("double time doubles the tempo and adds 1 to landed hits", () => {
    const { battle } = withEnemyRelics([], [relic("double_time")]);
    expect(battle.bpm).toBe(battle.spec.bpm * 2);
    const e = { hp: 5, maxHp: 5, energy: 0, maxEnergy: 3 };
    const r = resolve({ hp: 5, maxHp: 5, energy: 1, maxEnergy: 3 }, "attack", e, "charge", { playerDamageBonus: 1 });
    expect(r.player.damageDealt).toBe(2);
    const blocked = resolve({ hp: 5, maxHp: 5, energy: 1, maxEnergy: 3 }, "attack", { ...e }, "guard", { playerDamageBonus: 1 });
    expect(blocked.player.damageDealt).toBe(0);
  });

  it("hot blood costs 1 HP when FEVER breaks", () => {
    const { battle, spb } = withEnemyRelics([], [relic("hot_blood")]);
    let beat = 0;
    for (let acted = 0; acted < 10; beat++) {
      battle.onBeat(beat);
      const bar = Math.floor(beat / 4);
      if (beat % 4 === 3 && !battle.isRestBar(bar)) {
        battle.pressAction("guard", beat, spb);
        battle.player.hp = 5;
        battle.enemy.hp = 5;
        acted++;
      }
      battle.onOffbeat(beat);
    }
    expect(battle.fever).toBe(true);
    for (let i = 0; i < 12 && battle.fever; i++, beat++) {
      battle.onBeat(beat);
      battle.onOffbeat(beat);
    }
    expect(battle.fever).toBe(false);
    expect(battle.player.hp).toBe(4);
  });

  it("iron wall guards stop the special", () => {
    const r = resolve({ hp: 5, maxHp: 5, energy: 3, maxEnergy: 3 }, "special", { hp: 5, maxHp: 5, energy: 0, maxEnergy: 3 }, "guard", { enemyGuardBonus: 1 });
    expect(r.player.damageDealt).toBe(0);
    expect(r.enemy.guarded).toBe(true);
  });

  it("silence locks consumables and allegro speeds the fight up", () => {
    const { battle, spb } = withEnemyRelics(["silence", "allegro"], [], [itemById("bandage") as Consumable]);
    expect(battle.bpm).toBe(battle.spec.bpm + 20);
    for (let b = 0; b < 5; b++) battle.onBeat(b);
    expect(battle.useItem(0, 5, spb)).toBeNull();
    expect(battle.loadout.slots[0]).not.toBeNull();
  });

  it("rest bars are off by default and the tea break turns them on", () => {
    const { battle: plain, spb } = withEnemyRelics([]);
    expect(plain.options.restBars).toBe(false);
    for (let b = 0; b < 7; b++) plain.onBeat(b);
    plain.pressAction("charge", 7, spb);
    expect(plain.isRestBar(2)).toBe(false);
    const { battle: tea } = withEnemyRelics([], [relic("tea_break")]);
    expect(tea.options.restBars).toBe(true);
    for (let b = 0; b < 7; b++) tea.onBeat(b);
    tea.pressAction("charge", 7, spb);
    expect(tea.isRestBar(2)).toBe(true);
  });

  it("backpack, power bank and pressure change the enemy's stats and the player's window", () => {
    const { battle } = withEnemyRelics(["backpack", "power_bank", "pressure", "yawn"]);
    expect(battle.enemy.maxHp).toBe(battle.spec.maxHp + 2);
    expect(battle.enemy.maxEnergy).toBe(4);
    expect(battle.enemy.energy).toBe(battle.spec.startEnergy + 1);
    expect(battle.perfectWindowMult).toBeCloseTo(0.7);
    expect(battle.feverThreshold).toBe(14);
  });

  it("alarm clock charges the enemy whenever the player waits", () => {
    const { battle } = withEnemyRelics(["alarm_clock"]);
    battle.enemy.energy = 0;
    for (let b = 4; b < 8; b++) {
      battle.onBeat(b);
      battle.onOffbeat(b);
    }
    expect(battle.enemy.energy).toBeGreaterThanOrEqual(1);
  });

  it("magnet drains the player's energy when the enemy guards", () => {
    const { battle, spb } = withEnemyRelics(["magnet"]);
    battle.spec.ai.randomness = 0;
    for (let b = 0; b < 7; b++) battle.onBeat(b);
    battle.player.energy = 2;
    (battle as unknown as { enemyChoice: string }).enemyChoice = "guard";
    battle.pressAction("attack", 7, spb);
    battle.onOffbeat(7);
    expect(battle.player.energy).toBe(0);
  });

  it("boxing gloves add 1 to the enemy's landed hits", () => {
    const { battle, spb } = withEnemyRelics(["boxing_gloves"]);
    for (let b = 0; b < 7; b++) battle.onBeat(b);
    battle.enemy.energy = 1;
    (battle as unknown as { enemyChoice: string }).enemyChoice = "attack";
    battle.pressAction("charge", 7, spb);
    expect(battle.player.hp).toBe(3);
  });

  it("cheer flag heals 1 every sixth action in a row, twice per fight", () => {
    const { battle, events, spb } = withEnemyRelics([], [relic("cheer_flag")]);
    let beat = 0;
    for (let acted = 0; acted < 24; beat++) {
      battle.onBeat(beat);
      if (beat % 4 === 3 && !battle.isRestBar(Math.floor(beat / 4))) {
        battle.player.hp = 3;
        battle.enemy.hp = 5;
        battle.pressAction("guard", beat, spb);
        acted++;
      }
      battle.onOffbeat(beat);
    }
    const heals = events.filter((e) => e.type === "notice" && e.notice.item.id === "cheer_flag");
    expect(heals.length).toBe(2);
  });

  it("cold lemon heals once when HP drops to half", () => {
    const { battle } = withEnemyRelics([], [relic("cold_lemon")]);
    expect(battle.player.energy).toBe(1);
    const runner = (battle as unknown as { fire: (side: string, e: string, r: unknown) => void });
    const hit = { player: { damageTaken: 1, damageDealt: 0, guarded: false, action: "charge", whiffed: false, grade: null }, enemy: {}, clash: false };
    battle.player.hp = 2;
    runner.fire("player", "damaged", hit);
    expect(battle.player.hp).toBe(3);
    battle.player.hp = 2;
    runner.fire("player", "damaged", hit);
    expect(battle.player.hp).toBe(2);
  });

  it("big bottle starts with 2 energy", () => {
    const { battle } = withEnemyRelics([], [relic("big_bottle")]);
    expect(battle.player.energy).toBe(2);
    expect(battle.player.maxEnergy).toBe(4);
  });
});

describe("FEVER-reactive enemy relics", () => {
  const relic = (id: string) => itemById(id) as Relic;

  /** Acts on every call bar until FEVER starts, keeping both sides healthy. */
  function reachFever(enemyRelics: string[], playerRelics: string[] = []) {
    const spec = enemyFor(1, new Rng(1));
    spec.relics = enemyRelics.map(relic);
    spec.tellChance = 0;
    const events: BattleEvent[] = [];
    const battle = new Battle(spec, { hp: 5, maxHp: 5, relics: playerRelics.map(relic), slots: [] }, new Rng(2), (e) => events.push(e));
    battle.start();
    const spb = 60 / battle.bpm;
    let beat = 0;
    while (!battle.fever) {
      battle.onBeat(beat);
      if (beat % 4 === 3 && !battle.isRestBar(Math.floor(beat / 4))) {
        battle.player.hp = battle.enemy.hp = 5;
        battle.player.energy = 2;
        battle.pressAction("guard", beat, spb);
      }
      battle.onOffbeat(beat);
      beat++;
    }
    return { battle, events, beat };
  }

  function breakFever(battle: Battle, from: number): void {
    for (let beat = from; battle.fever; beat++) {
      battle.onBeat(beat);
      battle.onOffbeat(beat);
    }
  }

  it("boo and extinguisher fire when the player's FEVER starts", () => {
    const { battle } = reachFever(["boo", "extinguisher"]);
    expect(battle.player.energy).toBe(0);
    expect(battle.enemy.energy).toBeGreaterThanOrEqual(2);
  });

  it("grudge and cold shoulder fire when the player's FEVER breaks", () => {
    const { battle, beat } = reachFever(["grudge", "cold_shoulder"]);
    battle.enemy.hp = 1;
    battle.player.hp = 5;
    breakFever(battle, beat);
    expect(battle.enemy.hp).toBe(3);
    expect(battle.player.hp).toBe(4);
  });

  it("mark adds 1 to the enemy's hits while the player is in FEVER", () => {
    const { battle, beat } = reachFever(["mark"]);
    let b = beat;
    while (b % 4 !== 3) battle.onBeat(b++);
    battle.onBeat(b);
    battle.player.hp = 5;
    battle.enemy.energy = 1;
    (battle as unknown as { enemyChoice: string }).enemyChoice = "attack";
    battle.pressAction("charge", b, 60 / battle.bpm);
    expect(battle.player.hp).toBe(3);
  });
});

describe("build series", () => {
  const relic = (id: string) => itemById(id) as Relic;

  function arena(relics: string[], slots: string[] = []) {
    const spec = enemyFor(1, new Rng(1));
    spec.relics = [];
    spec.tellChance = 0;
    const events: BattleEvent[] = [];
    const battle = new Battle(spec, { hp: 5, maxHp: 5, relics: relics.map(relic), slots: slots.map((id) => itemById(id) as Consumable) }, new Rng(2), (e) => events.push(e));
    battle.start();
    const spb = 60 / battle.bpm;
    let beat = 0;
    /** Plays one bar: optional item on beat 1, then `mine` vs `theirs` on beat 4 (null = wait). */
    const round = (mine: ActionId | null, theirs: ActionId, setup: () => void = () => {}, item?: number) => {
      while (beat % 4 !== 0 || beat === 0) {
        battle.onBeat(beat);
        battle.onOffbeat(beat);
        beat++;
      }
      battle.onBeat(beat);
      if (item !== undefined) battle.useItem(item, beat, spb);
      for (let b = 1; b < 4; b++) battle.onBeat(beat + b);
      (battle as unknown as { enemyChoice: ActionId }).enemyChoice = theirs;
      setup();
      if (mine) battle.pressAction(mine, beat + 3, spb);
      battle.onOffbeat(beat + 3);
      beat += 4;
    };
    const fired = (id: string) => events.filter((e) => e.type === "notice" && e.notice.item.id === id).length;
    return { battle, round, fired };
  }

  it("follow up: attack after attack hits a charging enemy for +1", () => {
    const { battle, round } = arena(["follow_up"]);
    round("attack", "charge", () => (battle.player.energy = 1));
    const hp = battle.enemy.hp;
    round("attack", "charge", () => (battle.player.energy = 1));
    expect(hp - battle.enemy.hp).toBe(2);
  });

  it("persistence: a blocked follow-up attack refunds 1 energy", () => {
    const { battle, round } = arena(["persistence"]);
    round("attack", "charge", () => (battle.player.energy = 1));
    round("attack", "guard", () => (battle.player.energy = 1));
    expect(battle.player.energy).toBe(1);
  });

  it("persistence: refunds at most twice per fight", () => {
    const { battle, round } = arena(["persistence"]);
    round("attack", "charge", () => (battle.player.energy = 3));
    round("attack", "guard");
    round("attack", "guard");
    round("attack", "guard");
    expect(battle.player.energy).toBe(1);
  });

  it("counter: guarding an attack with energy spends 1 and deals 1", () => {
    const { battle, round } = arena(["counter"]);
    round("guard", "attack", () => {
      battle.player.energy = 2;
      battle.enemy.energy = 1;
    });
    expect(battle.player.energy).toBe(1);
    expect(battle.enemy.hp).toBe(battle.enemy.maxHp - 1);
  });

  it("standoff: both guarding gives 1 energy", () => {
    const { battle, round } = arena(["standoff"]);
    round("guard", "guard", () => (battle.player.energy = 0));
    expect(battle.player.energy).toBe(1);
  });

  it("breathing adds 1 on every second charge, overflow heals when charging at full", () => {
    const { battle, round } = arena(["breathing", "overflow"]);
    round("charge", "guard", () => (battle.player.energy = 0));
    expect(battle.player.energy).toBe(1);
    round("charge", "guard", () => (battle.player.energy = 0));
    expect(battle.player.energy).toBe(2);
    round("charge", "guard", () => {
      battle.player.energy = 3;
      battle.player.hp = 3;
    });
    expect(battle.player.hp).toBe(4);
  });

  it("discount makes the special cost 2; guard crush adds 1 against a guard", () => {
    const { battle, round } = arena(["discount", "guard_crush"]);
    expect(battle.costOf("special")).toBe(2);
    round("special", "guard", () => (battle.player.energy = 2));
    expect(battle.player.energy).toBe(0);
    expect(battle.enemy.hp).toBe(battle.enemy.maxHp - 2);
  });

  it("triple and finisher reward attack chains", () => {
    const { battle, round, fired } = arena(["triple", "finisher"]);
    for (let i = 0; i < 3; i++) round("attack", "charge", () => ((battle.player.energy = 1), (battle.enemy.hp = 5)));
    expect(fired("triple")).toBe(1);
    round("special", "charge", () => ((battle.player.energy = 3), (battle.enemy.hp = 5)));
    expect(fired("finisher")).toBe(1);
  });

  it("patience: two guards then an attack hits for +1", () => {
    const { battle, round, fired } = arena(["patience"]);
    round("guard", "guard");
    round("guard", "guard");
    round("attack", "charge", () => (battle.player.energy = 1));
    expect(fired("patience")).toBe(1);
  });

  it("composure and detective turn waits into energy and a guaranteed tell", () => {
    const spec = enemyFor(1, new Rng(1));
    spec.relics = [];
    spec.tellChance = 0;
    const events: BattleEvent[] = [];
    const battle = new Battle(spec, { hp: 5, maxHp: 5, relics: [relic("composure"), relic("detective")], slots: [] }, new Rng(2), (e) => events.push(e));
    battle.start();
    for (let b = 0; b < 12; b++) {
      battle.onBeat(b);
      battle.onOffbeat(b);
    }
    expect(battle.player.energy).toBe(2);
    expect(events.filter((e) => e.type === "tell").length).toBe(1);
  });

  it("wraps and shield sticker change only this bar's round", () => {
    const { battle, round } = arena([], ["wraps", "shield_sticker"]);
    round("attack", "charge", () => (battle.player.energy = 1), 0);
    expect(battle.enemy.hp).toBe(battle.enemy.maxHp - 2);
    round("charge", "attack", () => (battle.enemy.energy = 1), 1);
    expect(battle.player.hp).toBe(5);
  });
});
