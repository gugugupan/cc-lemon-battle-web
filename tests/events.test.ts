import { expect, it } from "vitest";
import { EVENT_IDS, EVENTS, eventPool } from "../src/core/events";
import { Rng } from "../src/core/rng";
import { enemyFor, Run } from "../src/core/run";

it("rolls events only after regular wins, never a challenger before an elite", () => {
  const run = new Run(3);
  const seen = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const wasElite = run.enemy.elite;
    run.finishBattle(true, run.maxHp);
    if (wasElite) expect(run.event).toBeNull();
    if (run.event === "transfer") expect(run.enemy.elite).toBe(false);
    if (run.event) seen.add(run.event);
    run.event = null;
  }
  expect(seen.size).toBeGreaterThan(3);
  expect(eventPool(true)).not.toContain("transfer");
});

it("applies choices and refuses blocked ones", () => {
  const run = new Run(1);
  run.gold = 5;
  run.event = "vending";
  expect(run.chooseEvent(0)).toBeNull();
  expect(run.event).toBe("vending");
  run.hp = 2;
  run.gold = 30;
  expect(run.chooseEvent(0)?.result).toBe("ev_vending_buy_r");
  expect(run.hp).toBe(4);
  expect(run.gold).toBe(15);
  expect(run.event).toBeNull();

  run.event = "homework";
  const before = run.relics.length;
  run.hp = 5;
  expect(run.chooseEvent(1)?.item).toBeTruthy();
  expect(run.relics.length).toBe(before + 1);
  expect(run.hp).toBe(2);

  run.event = "shrine";
  const maxHp = run.maxHp;
  expect(run.chooseEvent(0)?.chest).toBe(true);
  expect(run.maxHp).toBe(maxHp - 1);
  expect(run.relicPick.length).toBe(3);
});

it("turns the next fight into an elite when the challenger is accepted", () => {
  const run = new Run(1);
  run.round = 3;
  run.enemy = enemyFor(3, new Rng(1));
  const hp = run.enemy.maxHp;
  run.event = "transfer";
  run.chooseEvent(0);
  expect(run.enemy.elite).toBe(true);
  expect(run.enemy.maxHp).toBe(hp + 2);
  const gold = run.finishBattle(true, run.maxHp);
  expect(run.relicPick.length).toBe(3);
  expect(gold).toBe(run.goldFor(3));
});

it("gives every event a way out that is never blocked", () => {
  const run = new Run(1);
  run.gold = 0;
  run.slots = [null, null, null, null];
  for (const id of EVENT_IDS) expect(EVENTS[id].some((c) => c.blocked(run) === null)).toBe(true);
});
