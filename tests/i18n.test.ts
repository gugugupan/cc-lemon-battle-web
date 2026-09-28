import { expect, it, vi } from "vitest";

vi.stubGlobal("navigator", { language: "ja" });
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });

const { hasKey } = await import("../src/i18n");
const { ALL_ITEMS } = await import("../src/core/items");
const { ENEMY_NAME_COUNT, RANK_COUNT } = await import("../src/core/run");

it("has text for every item, enemy name and rank", () => {
  const missing: string[] = [];
  for (const item of ALL_ITEMS) {
    for (const key of [`item_${item.id}`, `item_${item.id}_desc`]) if (!hasKey(key)) missing.push(key);
  }
  for (let i = 0; i < ENEMY_NAME_COUNT; i++) if (!hasKey(`name${i}`)) missing.push(`name${i}`);
  for (let i = 0; i < RANK_COUNT; i++) if (!hasKey(`rank${i}`)) missing.push(`rank${i}`);
  for (const a of ["attack", "guard", "charge", "special"]) {
    for (const key of [`action_${a}`, `tell_${a}`]) if (!hasKey(key)) missing.push(key);
  }
  expect(missing).toEqual([]);
});
