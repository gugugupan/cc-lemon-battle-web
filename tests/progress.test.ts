import { expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });

const { loadClear, recordClear } = await import("../src/game/progress");

it("remembers the first clear, the latest one and how many", () => {
  expect(loadClear()).toBeNull();
  recordClear(new Date("2026-09-30T10:00:00Z"));
  const again = recordClear(new Date("2026-10-02T12:00:00Z"));
  expect(again).toEqual({ first: "2026-09-30T10:00:00.000Z", last: "2026-10-02T12:00:00.000Z", count: 2 });
  expect(loadClear()).toEqual(again);
});
