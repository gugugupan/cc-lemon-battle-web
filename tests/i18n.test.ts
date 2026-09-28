import { expect, it, vi } from "vitest";

vi.stubGlobal("navigator", { language: "ja" });
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });

const { hasKey } = await import("../src/i18n");
const { ALL_ITEMS, CONSUMABLES, RELICS, SERIES } = await import("../src/core/items");
const { ENEMY_NAME_COUNT, RANK_COUNT, TELL_LINES } = await import("../src/core/run");

it("has text for every item, enemy name and rank", () => {
  const missing: string[] = [];
  for (const item of ALL_ITEMS) {
    for (const key of [`item_${item.id}`, `item_${item.id}_desc`]) if (!hasKey(key)) missing.push(key);
  }
  for (let i = 0; i < ENEMY_NAME_COUNT; i++) if (!hasKey(`name${i}`)) missing.push(`name${i}`);
  for (const s of SERIES) if (!hasKey(`series_${s}`)) missing.push(`series_${s}`);
  for (const item of [...CONSUMABLES, ...RELICS]) if (!item.series) missing.push(`${item.id} has no series`);
  for (let i = 0; i < RANK_COUNT; i++) if (!hasKey(`rank${i}`)) missing.push(`rank${i}`);
  for (const a of ["attack", "guard", "charge", "special"]) {
    if (!hasKey(`action_${a}`)) missing.push(`action_${a}`);
    for (let i = 0; i < TELL_LINES; i++) if (!hasKey(`tell_${a}_${i}`)) missing.push(`tell_${a}_${i}`);
  }
  expect(missing).toEqual([]);
});
