import { expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });

const { DEFAULT_VOLUME, loadBest, loadBought, loadClear, loadVolume, recordBought, recordClear, saveBestFor, saveVolume } = await import("../src/game/progress");

it("remembers the first clear, the latest one and how many", () => {
  expect(loadClear()).toBeNull();
  recordClear(new Date("2026-09-30T10:00:00Z"));
  const again = recordClear(new Date("2026-10-02T12:00:00Z"));
  expect(again).toEqual({ first: "2026-09-30T10:00:00.000Z", last: "2026-10-02T12:00:00.000Z", count: 2 });
  expect(loadClear()).toEqual(again);
});

it("keeps a best streak per character and remembers purchases", () => {
  expect(saveBestFor("librarian", 7)).toBe(true);
  expect(saveBestFor("librarian", 5)).toBe(false);
  expect(saveBestFor("normal", 3)).toBe(true);
  expect(loadBest()).toBe(7);
  recordBought("breathing");
  recordBought("breathing");
  expect([...loadBought()]).toEqual(["breathing"]);
});

it("keeps volume levels, turning an old music-off setting into music at 0", () => {
  expect(loadVolume()).toEqual(DEFAULT_VOLUME);
  store.set("cc-lemon:music", "off");
  expect(loadVolume()).toEqual({ music: 0, sfx: DEFAULT_VOLUME.sfx });
  saveVolume({ music: 0.3, sfx: 0.8 });
  expect(loadVolume()).toEqual({ music: 0.3, sfx: 0.8 });
  store.set("cc-lemon:volume", JSON.stringify({ music: 7, sfx: "loud" }));
  expect(loadVolume()).toEqual({ music: 0, sfx: DEFAULT_VOLUME.sfx });
});
