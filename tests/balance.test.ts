import { expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { enemyFor } from "../src/core/run";
import { CASUAL, type PlayerModel, sampleBuilds, simulate, SKILLED } from "../src/core/sim";

const GAMES = 400;

function winRate(round: number, player: PlayerModel, restBars = true): number {
  let wins = 0;
  for (let g = 0; g < GAMES; g++) {
    const spec = enemyFor(round, new Rng(round * 1000 + g));
    if (simulate(spec, { hp: 5, maxHp: 5, relics: [], slots: [] }, player, g, { restBars }).won) wins++;
  }
  return wins / GAMES;
}

it("gets harder every fight", () => {
  const rows: string[] = [];
  const casual: number[] = [];
  for (const round of [1, 2, 3, 4, 5, 6, 8, 10, 12, 15]) {
    const s = winRate(round, CASUAL);
    const t = winRate(round, { ...CASUAL, strategy: "tell_reader" });
    const fast = winRate(round, CASUAL, false);
    casual.push(s);
    const pct = (v: number) => `${(v * 100).toFixed(0).padStart(3)}%`;
    rows.push(`round ${String(round).padStart(2)}: sensible ${pct(s)}  tell_reader ${pct(t)}  sensible/no-rest ${pct(fast)}`);
  }
  console.log(rows.join("\n"));
  expect(casual[0]).toBeGreaterThan(0.8);
  expect(casual[casual.length - 1]).toBeLessThan(casual[0]);
});

/**
 * Guardrails against equipment that is stronger than intended: a skilled player with a late-run
 * pile of relics (random 7-relic builds, 7 HP, a full bag) at fight 20.
 */
it("keeps stacked equipment in check at fight 20", () => {
  const report = sampleBuilds(20, 7, 7, SKILLED, 160, 30);
  const median = report.rates[Math.floor(report.rates.length / 2)];
  const top = report.rates[Math.floor(report.rates.length * 0.05)];
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  console.log(`fight 20, 7 relics: median ${pct(median)}, top 5% ${pct(top)}; strongest relics ${report.marginal.slice(0, 5).map((m) => `${m.id} +${(m.delta * 100).toFixed(0)}`).join(", ")}`);
  expect(top).toBeLessThanOrEqual(GUARD.topBuild);
  expect(report.marginal[0].delta).toBeLessThanOrEqual(GUARD.relicMarginal);
}, 120_000);

const GUARD = { topBuild: 0.92, relicMarginal: 0.15 };
