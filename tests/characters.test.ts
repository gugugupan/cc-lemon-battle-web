import { expect, it } from "vitest";
import { CHARACTERS, isUnlocked } from "../src/core/characters";
import { itemById } from "../src/core/items";
import { Run } from "../src/core/run";

it("every character's starting kit exists and fits the bag", () => {
  for (const c of CHARACTERS) {
    for (const id of [...c.relics, ...c.items]) expect(() => itemById(id)).not.toThrow();
    const run = new Run(1, c);
    expect(run.hp).toBe(c.hp);
    expect(run.gold).toBe(c.gold);
    expect(run.relics.map((r) => r.id)).toEqual(c.relics);
    expect(run.slots.filter(Boolean).length).toBe(c.items.length);
    expect(run.enemy.model).not.toBe(c.model);
  }
});

it("unlocks by default, by wins, or by having bought an item", () => {
  const byId = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));
  expect(isUnlocked(byId.normal, 0, new Set())).toBe(true);
  expect(isUnlocked(byId.blaster, 7, new Set())).toBe(false);
  expect(isUnlocked(byId.blaster, 8, new Set())).toBe(true);
  expect(isUnlocked(byId.brass, 0, new Set(["breathing"]))).toBe(true);
  expect(isUnlocked(byId.sleuth, 99, new Set())).toBe(false);
});
