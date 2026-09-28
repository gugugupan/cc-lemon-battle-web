import { expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { enemyFor } from "../src/core/run";
import { simulate, type Strategy } from "../src/core/sim";

const GAMES = 400;

function winRate(round: number, strategy: Strategy, restBars = true): number {
  let wins = 0;
  for (let g = 0; g < GAMES; g++) {
    const spec = enemyFor(round, new Rng(round * 1000 + g));
    if (simulate(spec, { hp: 5, maxHp: 5, relics: [], slots: [] }, strategy, 0.6, g, { restBars }).won) wins++;
  }
  return wins / GAMES;
}

it("gets harder every fight", () => {
  const rows: string[] = [];
  const sensible: number[] = [];
  for (const round of [1, 2, 3, 4, 5, 6, 8, 10, 12, 15]) {
    const s = winRate(round, "sensible");
    const t = winRate(round, "tell_reader");
    const fast = winRate(round, "sensible", false);
    sensible.push(s);
    const pct = (v: number) => `${(v * 100).toFixed(0).padStart(3)}%`;
    rows.push(`round ${String(round).padStart(2)}: sensible ${pct(s)}  tell_reader ${pct(t)}  sensible/no-rest ${pct(fast)}`);
  }
  console.log(rows.join("\n"));
  expect(sensible[0]).toBeGreaterThan(0.8);
  expect(sensible[sensible.length - 1]).toBeLessThan(sensible[0]);
});
